package drift

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
)

// FileState tracks detailed file attributes
type FileState struct {
	Hash string
	Size int64
	Mode os.FileMode
}

// Detector monitors file system changes
type Detector struct {
	paths     []string
	lastState map[string]FileState // path -> FileState
	ignores   []string
}

// New creates a new drift detector for the given paths
func New(paths []string) *Detector {
	return &Detector{
		paths:     paths,
		lastState: make(map[string]FileState),
		ignores:   []string{},
	}
}

// SetIgnore updates the list of ignored patterns
func (d *Detector) SetIgnore(patterns []string) {
	d.ignores = patterns
}

// SetPaths updates the monitored paths and resets state to avoid false positives
func (d *Detector) SetPaths(paths []string) {
	// Check if paths changed (simple length check or deep compare)
	// For simplicity, we just check length or if the content is different
	changed := false
	if len(d.paths) != len(paths) {
		changed = true
	} else {
		for i, p := range d.paths {
			if p != paths[i] {
				changed = true
				break
			}
		}
	}

	if changed {
		d.paths = paths
		// Clear state to force a fresh baseline
		d.lastState = make(map[string]FileState)
	}
}

// Check calculates the current state and returns details about changes
func (d *Detector) Check() (changed bool, summary string, err error) {
	currentState, err := calculateState(d.paths, d.ignores)
	if err != nil {
		return false, "", fmt.Errorf("failed to calculate state: %w", err)
	}

	// First run, just populate state
	if len(d.lastState) == 0 {
		d.lastState = currentState
		return false, "", nil
	}

	var changes []string

	// Check for added or modified files
	for path, newState := range currentState {
		oldState, exists := d.lastState[path]
		if !exists {
			changes = append(changes, fmt.Sprintf("File created: %s", path))
		} else {
			// Check specific attributes
			var diffs []string
			if oldState.Hash != newState.Hash {
				diffs = append(diffs, "Content changed")
			}
			if oldState.Size != newState.Size {
				diffs = append(diffs, fmt.Sprintf("Size: %d->%d B", oldState.Size, newState.Size))
			}
			if oldState.Mode != newState.Mode {
				diffs = append(diffs, fmt.Sprintf("Perms: %o->%o", oldState.Mode, newState.Mode))
			}

			if len(diffs) > 0 {
				details := ""
				if len(diffs) > 0 {
					details = fmt.Sprintf(" (%s)", joinStrings(diffs, ", "))
				}
				changes = append(changes, fmt.Sprintf("File modified: %s%s", path, details))
			}
		}
	}

	// Check for deleted files
	for path := range d.lastState {
		if _, exists := currentState[path]; !exists {
			// Only report deleted if it was in one of the currently monitored paths
			// (If a path was removed from config, we reset state so we won't get here, 
			// but good to be safe)
			changes = append(changes, fmt.Sprintf("File deleted: %s", path))
		}
	}

    // DEBUG: Log state update
    if len(changes) > 0 {
        // fmt.Printf("DEBUG: Drift Check - Updating lastState. PrevHash: %v, NewHash: %v\n", d.lastState[changes[0]].Hash, currentState[changes[0]].Hash)
    }

	d.lastState = currentState

	if len(changes) > 0 {
		// Sort changes for consistency
		sort.Strings(changes)
		
		// Create summary
		summary = changes[0]
		if len(changes) > 1 {
			summary = fmt.Sprintf("%s and %d others", changes[0], len(changes)-1)
		}
		
		return true, summary, nil
	}

	return false, "", nil
}

// calculateState computes Hash, Size, and Mode of each file in the directory trees
func calculateState(roots []string, ignores []string) (map[string]FileState, error) {
	state := make(map[string]FileState)

	for _, root := range roots {
		// Walk the directory tree
		err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				// Skip permission denied errors
				if os.IsPermission(err) {
					return nil
				}
				// If root doesn't exist, just skip it without erroring the whole batch
				if os.IsNotExist(err) && path == root {
					return nil
				}
				return err
			}

			// Skip directories
			if info.IsDir() {
				return nil
			}

			// Skip symlinks
			if info.Mode()&os.ModeSymlink != 0 {
				return nil
			}

			// Check against ignore patterns
			relPath, err := filepath.Rel(root, path)
			if err == nil {
				for _, pattern := range ignores {
					if matched, _ := filepath.Match(pattern, relPath); matched {
						return nil
					}
					if matched, _ := filepath.Match(pattern, filepath.Base(path)); matched {
						return nil
					}
				}
			}

			// Calculate file checksum
			chksum, err := calculateFileChecksum(path)
			if err != nil {
				// If we can't read it (e.g. transient file), skip it
				fmt.Printf("Debug: Failed to read %s: %v\n", path, err)
				return nil
			}

			state[path] = FileState{
				Hash: chksum,
				Size: info.Size(),
				Mode: info.Mode().Perm(),
			}
			return nil
		})

		if err != nil {
			return nil, err
		}
	}

	return state, nil
}

// calculateFileChecksum computes SHA256 of a single file content
func calculateFileChecksum(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, file); err != nil {
		return "", err
	}

	return hex.EncodeToString(hasher.Sum(nil)), nil
}

// Helper to join strings (since strings.Join takes []string, but we built it dynamically)
func joinStrings(parts []string, sep string) string {
	if len(parts) == 0 {
		return ""
	}
	if len(parts) == 1 {
		return parts[0]
	}
	result := parts[0]
	for _, p := range parts[1:] {
		result += sep + p
	}
	return result
}
