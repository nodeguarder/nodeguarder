package license

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
)

// EncryptLicense encrypts a license YAML string using AES-256-GCM
func EncryptLicense(plaintext string, encryptionKey string) (string, error) {
	// Validate key length (must be 32 bytes for AES-256)
	key := []byte(encryptionKey)
	if len(key) != 32 {
		return "", fmt.Errorf("encryption key must be exactly 32 bytes (256 bits), got %d", len(key))
	}

	// Create cipher block
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Use GCM mode for authenticated encryption
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Create nonce (12 bytes for GCM)
	nonce := make([]byte, aead.NonceSize())
	if _, err = io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// Encrypt plaintext
	ciphertext := aead.Seal(nonce, nonce, []byte(plaintext), nil)

	// Encode to base64 for storage/transport
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	return encoded, nil
}

// DecryptLicense decrypts a license that was encrypted with EncryptLicense
func DecryptLicense(encryptedBase64 string, encryptionKey string) (string, error) {
	// Validate key length (must be 32 bytes for AES-256)
	key := []byte(encryptionKey)
	if len(key) != 32 {
		return "", fmt.Errorf("encryption key must be exactly 32 bytes (256 bits), got %d", len(key))
	}

	// Decode from base64
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedBase64)
	if err != nil {
		return "", fmt.Errorf("failed to decode base64: %w", err)
	}

	// Create cipher block
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	// Use GCM mode
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	// Extract nonce from ciphertext (first NonceSize() bytes)
	nonceSize := aead.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]

	// Decrypt
	plaintext, err := aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed (likely wrong key or corrupted data): %w", err)
	}

	return string(plaintext), nil
}

// GenerateRandomKey generates a random 32-byte (256-bit) encryption key
// Returns the key as a base64-encoded string for easy distribution/storage
func GenerateRandomKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key), nil
}
