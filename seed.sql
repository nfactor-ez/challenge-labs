-- ═══════════════════════════════════════════════════════════════════════════════
-- ChallengeLabs — Seed Data
-- Runs automatically on first `docker-compose up` via postgres initdb.d
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable pgcrypto for bcrypt (used by the Go app)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── Admin users ──────────────────────────────────────────────────────────────
-- Password: admin123  (default admin — change after first login!)
INSERT INTO users (username, email, password_hash, role)
VALUES (
  'admin',
  'admin@challengelabs.local',
  crypt('admin123', gen_salt('bf')),
  'admin'
) ON CONFLICT DO NOTHING;

-- Password: test1234
INSERT INTO users (username, email, password_hash, role)
VALUES (
  'test123',
  'test123@gmail.com',
  crypt('test1234', gen_salt('bf')),
  'admin'
) ON CONFLICT DO NOTHING;

-- ─── Categories ───────────────────────────────────────────────────────────────
INSERT INTO categories (name, slug, description) VALUES
  ('Miscellaneous',      'misc',  'Everything that doesn''t fit elsewhere.'),
  ('Web Exploitation',   'web',   'HTTP, APIs, SQL injection, XSS, SSRF, and more.'),
  ('Binary Exploitation','pwn',   'Buffer overflows, ROP chains, heap exploitation.'),
  ('Cryptography',       'crypto','Breaking ciphers, hash collisions, and key recovery.')
ON CONFLICT DO NOTHING;

-- ─── Challenges ───────────────────────────────────────────────────────────────

-- 1. Nginx Port Discovery (Misc / Easy)
INSERT INTO challenges (title, slug, description, difficulty, points, docker_image, flag, tags, is_published, category_id)
SELECT
  'Nginx Port Discovery',
  'nginx-port-discovery',
  E'# Nginx Port Discovery\n\nAn Nginx server is running inside this container — but it''s listening on a non-standard port.\n\nYour mission:\n1. Scan the container to find the hidden port\n2. Connect to it and retrieve the flag\n\n**Tools:** `nmap`, `curl`, `netcat`',
  'easy',
  50,
  'challengelabs-nginx:latest',
  '$2a$10$Ff/MkFcMGBN78nVGcu7mPe9uqjoCLwhwmWqLCi2W3eXEf25siwngi',
  'linux,beginner,shell',
  true,
  id
FROM categories WHERE slug = 'misc'
ON CONFLICT (slug) DO NOTHING;

-- 2. SQL Injection 101 (Web / Easy)
INSERT INTO challenges (title, slug, description, difficulty, points, docker_image, flag, tags, is_published, category_id)
SELECT
  'SQL Injection 101',
  'sqli-101',
  E'# SQL Injection 101\n\nA simple login form sits behind a web server running in this container. Can you bypass authentication?\n\n```\nUsername: admin'' --\nPassword: anything\n```',
  'easy',
  100,
  'alpine',
  '$2a$10$3FvJ8fQi.aM7RePXMTIEBOwvQGK7U.cdV43K9WBs1Dge5J44AT2iO',
  'web,sqli,auth-bypass',
  true,
  id
FROM categories WHERE slug = 'web'
ON CONFLICT (slug) DO NOTHING;

-- 3. Buffer Overflow Basics (Pwn / Medium)
INSERT INTO challenges (title, slug, description, difficulty, points, docker_image, flag, tags, is_published, category_id)
SELECT
  'Buffer Overflow Basics',
  'bof-basics',
  E'# Buffer Overflow Basics\n\nA deliberately vulnerable C binary is waiting for you. Overflow its local buffer to overwrite the return address and gain a shell.\n\n**Tools:** `gdb`, `pwntools`, `python3`',
  'medium',
  200,
  'alpine',
  '$2a$10$fu1T0qez8WwjKpY0C2JNEeEuE2vM6Y9pIHpcOagh1gL2Lzp9OMCwm',
  'pwn,bof,stack',
  true,
  id
FROM categories WHERE slug = 'pwn'
ON CONFLICT (slug) DO NOTHING;

-- 4. Caesar's Secret (Crypto / Easy)
INSERT INTO challenges (title, slug, description, difficulty, points, docker_image, flag, tags, is_published, category_id)
SELECT
  'Caesar''s Secret',
  'caesars-secret',
  E'# Caesar''s Secret\n\nYou''ve intercepted an encoded message: `synt{ebg13_vf_abg_rapelcgvba}`. Decode it to reveal the flag.',
  'easy',
  25,
  'alpine',
  '$2a$10$mU14nnF.mikE.Wz7VlCsu.Haqp/Vqnnb0aVDzxamsk9Yvk/nWFX5.',
  'crypto,rot13,classical',
  true,
  id
FROM categories WHERE slug = 'crypto'
ON CONFLICT (slug) DO NOTHING;
