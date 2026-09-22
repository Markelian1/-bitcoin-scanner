#!/usr/bin/env python3
"""
LOCAL BTC KEY VERIFIER
----------------------
This tool checks a private key that YOU already possess against one
specific Bitcoin address. It never sends the key to an API, GitHub,
a server, or this assistant, and it does not write the key to disk.

IMPORTANT:
- Do NOT paste a private key or seed phrase into chat.
- Do NOT put a private key into this public GitHub repository.
- This is a verifier, not a brute-force/key-recovery tool.
"""

import argparse
import hashlib
import getpass
import re
import sys

TARGET = "13JNV6t7SidcWzaFU1MxrKzgAHUcpDMiFe"

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (
    55066263022277343669578718895168534326250603453777594175500187360389116729240,
    32670510020758816978083085130507043184471273380659243275938904335757337482424,
)

def b58decode(s):
    n = 0
    for ch in s:
        if ch not in ALPHABET:
            raise ValueError("Invalid Base58 character")
        n = n * 58 + ALPHABET.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
    pad = len(s) - len(s.lstrip("1"))
    return b"\x00" * pad + raw

def b58encode(raw):
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = ALPHABET[r] + out
    pad = len(raw) - len(raw.lstrip(b"\x00"))
    return "1" * pad + (out or "")

def sha256(b):
    return hashlib.sha256(b).digest()

def hash160(b):
    h = sha256(b)
    try:
        return hashlib.new("ripemd160", h).digest()
    except ValueError as e:
        raise RuntimeError(
            "This Python/OpenSSL build does not provide RIPEMD160."
        ) from e

def base58check(payload):
    return b58encode(payload + sha256(sha256(payload))[:4])

def decode_wif(wif):
    raw = b58decode(wif.strip())
    if len(raw) not in (37, 38):
        raise ValueError("WIF length is invalid")
    body, checksum = raw[:-4], raw[-4:]
    if sha256(sha256(body))[:4] != checksum:
        raise ValueError("WIF checksum is invalid")
    if body[0] != 0x80:
        raise ValueError("This verifier expects a Bitcoin mainnet WIF")
    if len(body) == 34:
        if body[-1] != 0x01:
            raise ValueError("Invalid compressed WIF marker")
        return body[1:-1], True
    return body[1:], False

def inv(a):
    return pow(a, P - 2, P)

INF = None

def point_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    x1, y1 = a
    x2, y2 = b
    if x1 == x2:
        if (y1 + y2) % P == 0:
            return INF
        m = (3 * x1 * x1) * inv(2 * y1) % P
    else:
        m = (y2 - y1) * inv((x2 - x1) % P) % P
    x3 = (m * m - x1 - x2) % P
    y3 = (m * (x1 - x3) - y1) % P
    return x3, y3

def point_mul(k, point=G):
    if not 1 <= k < N:
        raise ValueError("Private key is outside secp256k1 range")
    result = INF
    addend = point
    while k:
        if k & 1:
            result = point_add(result, addend)
        addend = point_add(addend, addend)
        k >>= 1
    return result

def pubkey_from_private(key_bytes, compressed=True):
    k = int.from_bytes(key_bytes, "big")
    x, y = point_mul(k)
    if compressed:
        return bytes([0x02 | (y & 1)]) + x.to_bytes(32, "big")
    return b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")

def p2pkh_from_pubkey(pubkey):
    return base58check(b"\x00" + hash160(pubkey))

def normalize_key(text):
    text = text.strip()
    if re.fullmatch(r"[0-9a-fA-F]{64}", text):
        key = bytes.fromhex(text)
        if not 1 <= int.from_bytes(key, "big") < N:
            raise ValueError("Hex private key is outside secp256k1 range")
        return key, None
    key, compressed = decode_wif(text)
    if len(key) != 32:
        raise ValueError("Private key must be 32 bytes")
    if not 1 <= int.from_bytes(key, "big") < N:
        raise ValueError("Private key is outside secp256k1 range")
    return key, compressed

def check(text, target):
    key, compressed = normalize_key(text)
    modes = [compressed] if compressed is not None else [True, False]
    matches = []
    for mode in modes:
        pub = pubkey_from_private(key, mode)
        address = p2pkh_from_pubkey(pub)
        matches.append((mode, address, address == target))
    return matches

def main():
    parser = argparse.ArgumentParser(
        description="Check a BTC private key you already possess against the target address."
    )
    parser.add_argument(
        "--target",
        default=TARGET,
        help="Target P2PKH address (default is the address currently being investigated).",
    )
    parser.add_argument(
        "--key",
        help="Private key/WIF. Prefer interactive input so it is not exposed in shell history.",
    )
    args = parser.parse_args()

    target = args.target.strip()

    if args.key:
        print("WARNING: command-line arguments can be stored in shell history/process listings.")
        value = args.key
    else:
        value = getpass.getpass("Enter WIF or 64-hex private key (input is hidden): ")

    try:
        matches = check(value, target)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(2)
    finally:
        value = "0" * len(value)

    print("\nTARGET:", TARGET)
    for compressed, address, ok in matches:
        label = "compressed" if compressed else "uncompressed"
        print(f"{label:12} -> {address}   {'MATCH' if ok else 'NO MATCH'}")

    if any(ok for _, _, ok in matches):
        print("\nMATCH FOUND: this candidate key derives the target address.")
        print("Do not publish the key. Use a trusted wallet locally to sign a transaction.")
        sys.exit(0)

    print("\nNo match. This candidate does not control the target address.")
    sys.exit(1)

if __name__ == "__main__":
    main()
