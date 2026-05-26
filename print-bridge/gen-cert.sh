#!/bin/bash
# Generate self-signed TLS certificate untuk Pedami Print Bridge
# Jalankan sekali, lalu restart server.js

set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

cat > "$DIR/cert.conf" << 'EOF'
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = localhost

[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
IP.1  = 127.0.0.1
EOF

openssl req -x509 -newkey rsa:2048 \
  -keyout "$DIR/key.pem" \
  -out    "$DIR/cert.pem" \
  -days   3650 \
  -nodes  \
  -config "$DIR/cert.conf"

rm -f "$DIR/cert.conf"

echo ""
echo "======================================================"
echo "  Sertifikat berhasil dibuat!"
echo "======================================================"
echo "  cert.pem + key.pem tersimpan di: $DIR"
echo ""
echo "  Langkah selanjutnya:"
echo "  1. Restart: node server.js"
echo "  2. Buka browser -> https://localhost:6789"
echo "  3. Klik 'Advanced' -> 'Proceed to localhost' untuk trust cert"
echo "  4. Di Pengaturan app, set URL Bridge ke: https://localhost:6789"
echo "======================================================"
