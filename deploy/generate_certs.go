package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"
)

func main() {
	certDir := "certs"
	if len(os.Args) > 1 {
		certDir = os.Args[1]
	}

	if err := os.MkdirAll(certDir, 0755); err != nil {
		fmt.Printf("Failed to create directory: %v\n", err)
		os.Exit(1)
	}

	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		fmt.Printf("Failed to generate private key: %v\n", err)
		os.Exit(1)
	}

	notBefore := time.Now()
	notAfter := notBefore.Add(365 * 24 * time.Hour)

	serialNumberLimit := new(big.Int).Lsh(big.NewInt(1), 128)
	serialNumber, err := rand.Int(rand.Reader, serialNumberLimit)
	if err != nil {
		fmt.Printf("Failed to generate serial number: %v\n", err)
		os.Exit(1)
	}

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"NodeGuarder"},
		},
		NotBefore: notBefore,
		NotAfter:  notAfter,

		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		fmt.Printf("Failed to create certificate: %v\n", err)
		os.Exit(1)
	}

	// Save cert.pem
	certOut, err := os.Create(filepath.Join(certDir, "cert.pem"))
	if err != nil {
		fmt.Printf("Failed to open cert.pem for writing: %v\n", err)
		os.Exit(1)
	}
	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes}); err != nil {
		fmt.Printf("Failed to write data to cert.pem: %v\n", err)
		os.Exit(1)
	}
	if err := certOut.Close(); err != nil {
		fmt.Printf("Error closing cert.pem: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("wrote cert.pem")

	// Save key.pem
	keyOut, err := os.Create(filepath.Join(certDir, "key.pem"))
	if err != nil {
		fmt.Printf("Failed to open key.pem for writing: %v\n", err)
		os.Exit(1)
	}
	x509Encoded, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		fmt.Printf("Unable to marshal ECDSA private key: %v\n", err)
		os.Exit(1)
	}
	if err := pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: x509Encoded}); err != nil {
		fmt.Printf("Failed to write data to key.pem: %v\n", err)
		os.Exit(1)
	}
	if err := keyOut.Close(); err != nil {
		fmt.Printf("Error closing key.pem: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("wrote key.pem")
}
