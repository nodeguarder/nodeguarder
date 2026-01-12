package license

import (
	"encoding/base64"
	"testing"
)

func TestEncryptDecrypt(t *testing.T) {
	// Generate a test key
	testKey := make([]byte, 32)
	for i := range testKey {
		testKey[i] = byte(i)
	}
	keyBase64 := base64.StdEncoding.EncodeToString(testKey)
	keyString := keyBase64

	plaintext := `max_servers: 100
expires: "2026-12-31T23:59:59Z"
license_id: "pro-100-servers-001"
signature: "sha256:test"
company: "Test Company"`

	// Test encryption
	encrypted, err := EncryptLicense(plaintext, keyString)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	if encrypted == plaintext {
		t.Fatal("Encrypted text is same as plaintext - encryption failed")
	}

	// Test decryption
	decrypted, err := DecryptLicense(encrypted, keyString)
	if err != nil {
		t.Fatalf("Decryption failed: %v", err)
	}

	if decrypted != plaintext {
		t.Fatalf("Decrypted text does not match original.\nExpected:\n%s\n\nGot:\n%s", plaintext, decrypted)
	}

	t.Log("✅ Encryption/Decryption test passed")
}

func TestWrongKey(t *testing.T) {
	plaintext := "test data"

	// Encrypt with one key
	key1 := make([]byte, 32)
	for i := range key1 {
		key1[i] = byte(i)
	}
	key1String := base64.StdEncoding.EncodeToString(key1)

	encrypted, err := EncryptLicense(plaintext, key1String)
	if err != nil {
		t.Fatalf("Encryption failed: %v", err)
	}

	// Try to decrypt with different key
	key2 := make([]byte, 32)
	for i := range key2 {
		key2[i] = byte(i + 1)
	}
	key2String := base64.StdEncoding.EncodeToString(key2)

	_, err = DecryptLicense(encrypted, key2String)
	if err == nil {
		t.Fatal("Should have failed with wrong key")
	}

	t.Logf("✅ Wrong key test passed - error: %v", err)
}

func TestRandomKey(t *testing.T) {
	key, err := GenerateRandomKey()
	if err != nil {
		t.Fatalf("Failed to generate key: %v", err)
	}

	if key == "" {
		t.Fatal("Generated key is empty")
	}

	// Verify it's a valid base64 string
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil {
		t.Fatalf("Generated key is not valid base64: %v", err)
	}

	if len(decoded) != 32 {
		t.Fatalf("Generated key is wrong length: %d, expected 32", len(decoded))
	}

	t.Logf("✅ Random key generation test passed - key length: %d bytes", len(decoded))
}
