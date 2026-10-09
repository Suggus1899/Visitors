package security

import (
	"bytes"
	"compress/gzip"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/crypto/scrypt"
	"io"
	"strings"
)

func Hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func RandomToken() (string, error) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func Encrypt(key []byte, text string) (string, error) {
	if text == "" {
		return "", nil
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return "", e
	}
	gcm, e := cipher.NewGCMWithNonceSize(block, 16)
	if e != nil {
		return "", e
	}
	iv := make([]byte, 16)
	if _, e = rand.Read(iv); e != nil {
		return "", e
	}
	b := gcm.Seal(nil, iv, []byte(text), nil)
	return "ENC:" + hex.EncodeToString(b[:len(b)-16]) + ":" + hex.EncodeToString(iv) + ":" + hex.EncodeToString(b[len(b)-16:]), nil
}
func Decrypt(key []byte, text string) (string, error) {
	if text == "" {
		return "", nil
	}
	prefixed := strings.HasPrefix(text, "ENC:")
	parts := strings.Split(strings.TrimPrefix(text, "ENC:"), ":")
	if !prefixed && (len(parts) != 3 || len(parts[1]) != 32 || len(parts[2]) != 32) {
		return text, nil
	}
	if len(parts) != 3 {
		return "", errors.New("invalid encrypted field")
	}
	data, e := hex.DecodeString(parts[0])
	if e != nil {
		return "", e
	}
	iv, e := hex.DecodeString(parts[1])
	if e != nil || len(iv) != 16 {
		return "", errors.New("invalid nonce")
	}
	tag, e := hex.DecodeString(parts[2])
	if e != nil || len(tag) != 16 {
		return "", errors.New("invalid authentication tag")
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return "", e
	}
	gcm, e := cipher.NewGCMWithNonceSize(block, 16)
	if e != nil {
		return "", e
	}
	plain, e := gcm.Open(nil, iv, append(data, tag...), nil)
	if e != nil {
		return "", errors.New("encrypted field authentication failed")
	}
	return string(plain), nil
}

func VerifyPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
func PasswordHash(password string) (string, error) {
	if len(password) > 72 {
		return "", errors.New("new password exceeds bcrypt's 72-byte limit")
	}
	b, e := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(b), e
}

func DecryptBackup(password string, data []byte) ([]byte, error) {
	if len(data) < 48 {
		return nil, errors.New("truncated backup")
	}
	key, e := scrypt.Key([]byte(password), data[:16], 16384, 8, 1, 32)
	if e != nil {
		return nil, e
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	gcm, e := cipher.NewGCMWithNonceSize(block, 16)
	if e != nil {
		return nil, e
	}
	content, e := gcm.Open(nil, data[16:32], append(append([]byte{}, data[48:]...), data[32:48]...), nil)
	if e != nil {
		return nil, errors.New("backup authentication failed")
	}
	reader, e := gzip.NewReader(bytes.NewReader(content))
	if e != nil {
		return nil, e
	}
	defer reader.Close()
	limited := io.LimitReader(reader, 500*1024*1024+1)
	plain, e := io.ReadAll(limited)
	if len(plain) > 500*1024*1024 {
		return nil, errors.New("backup exceeds decompression limit")
	}
	return plain, e
}

func EncryptBackup(password string, data []byte) ([]byte, error) {
	if len(data) > 500*1024*1024 {
		return nil, errors.New("backup exceeds size limit")
	}
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, e := writer.Write(data); e != nil {
		return nil, e
	}
	if e := writer.Close(); e != nil {
		return nil, e
	}
	salt := make([]byte, 16)
	iv := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return nil, e
	}
	if _, e := rand.Read(iv); e != nil {
		return nil, e
	}
	key, e := scrypt.Key([]byte(password), salt, 16384, 8, 1, 32)
	if e != nil {
		return nil, e
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	gcm, e := cipher.NewGCMWithNonceSize(block, 16)
	if e != nil {
		return nil, e
	}
	sealed := gcm.Seal(nil, iv, compressed.Bytes(), nil)
	result := append(salt, iv...)
	result = append(result, sealed[len(sealed)-16:]...)
	return append(result, sealed[:len(sealed)-16]...), nil
}
