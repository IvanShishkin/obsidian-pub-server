# Obsidian Pub Server

Self-hosted server for publishing Obsidian notes to the web. Deploy on your own infrastructure and maintain full control over your data.

## Overview

This server works with the [Obsidian Pub Plugin](https://github.com/IvanShishkin/obsidian-pub-plugin) to enable one-click publishing of your markdown notes. Host on your own domain, protect with passwords, and keep your content private.

## Live Demo

See how your published notes look in action:

**👉 [Example Publication: The Law of Large Numbers](https://pub.shishkin.tech/p/zuks_GfgR48B)**

## Features

- **Self-hosted** — Deploy on your VPS, home server, or cloud infrastructure
- **Custom domain** — Serve notes from your own domain with automatic SSL
- **Password protection** — Secure individual publications with passwords
- **Docker-based** — Easy deployment with Docker Compose
- **Automatic HTTPS** — Let's Encrypt certificates configured automatically
- **Rate limiting** — Built-in protection against abuse
- **Health monitoring** — Health check endpoints for uptime monitoring

## Requirements

- Linux server (Ubuntu 20.04+ recommended)
- Docker and Docker Compose (automatically installed if missing)
- Domain name pointing to your server
- Ports 80 and 443 open

## Quick Start

### Automated Installation

```bash
# Clone the repository
git clone https://github.com/IvanShishkin/obsidian-pub-server.git
cd obsidian-pub-server

# Run the installer
sudo chmod +x install.sh
sudo ./install.sh
```

The installer will:
1. Install Docker and Docker Compose if not present
2. Prompt for your domain and email
3. Generate secure authentication keys
4. Obtain SSL certificate from Let's Encrypt
5. Start all services
6. Display your SECRET_KEY for plugin configuration

### Manual Installation

1. Clone the repository:
```bash
git clone https://github.com/IvanShishkin/obsidian-pub-server.git
cd obsidian-pub-server
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```bash
# Generate secrets
SECRET_KEY=$(openssl rand -hex 32)
SESSION_SECRET=$(openssl rand -hex 32)

# Set your domain and email
DOMAIN=publish.yourdomain.com
EMAIL=your-email@example.com
```

4. Start the services:
```bash
docker compose up -d
```

## Getting updates

Use the included update script to safely update your installation:

```bash
# Make the script executable (first time only)
chmod +x update.sh

# Run interactive update
./update.sh

# Quick update without prompts
./update.sh --quick

# Force update with backup and cleanup
./update.sh --force
```

### What the Update Script Does

1. **Checks for local changes** — offers to stash uncommitted modifications
2. **Pulls latest code** — fetches updates from the git repository
3. **Creates backup** — optionally backs up your publications before updating
4. **Rebuilds containers** — rebuilds all Docker images without cache
5. **Health check** — verifies the application starts correctly
6. **Cleanup** — removes old Docker images to free disk space

### Backups

Backups are stored in the `./backups/` directory with timestamps:
```bash
# List backups
ls -la ./backups/

# Restore from backup (if needed)
docker run --rm -v obsidian-pub-server_app_data:/data -v $(pwd)/backups:/backup alpine tar xzf /backup/backup_YYYYMMDD_HHMMSS.tar.gz -C /data
```


## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Application port | `3000` |
| `SECRET_KEY` | API authentication key | *required* |
| `DOMAIN` | Your domain name | *required* |
| `EMAIL` | Email for Let's Encrypt | *required* |
| `SESSION_SECRET` | Session encryption key | *required* |
| `MAX_CONTENT_SIZE` | Max upload size in bytes | `10485760` (10MB) |
| `RATE_LIMIT_WINDOW` | Rate limit window (ms) | `60000` |
| `RATE_LIMIT_MAX` | Max requests per window | `100` |
| `RATE_LIMIT_PUBLIC` | Public endpoint limit | `1000` |
| `RATE_LIMIT_PASSWORD` | Password attempt limit | `5` |
| `CORS_ORIGINS` | Allowed CORS origins | `*` |
| `BCRYPT_ROUNDS` | Password hashing rounds | `12` |

### Generating Secure Keys

```bash
# Generate SECRET_KEY
openssl rand -hex 32

# Generate SESSION_SECRET
openssl rand -hex 32
```

## API Endpoints

### Health Check
```
GET /api/health
```
Returns server status.

### Check File Existence
```
GET /api/check/:filename
Authorization: Bearer <SECRET_KEY>
```
Check if a file has been published.

### Publish New File
```
POST /api/publish
Authorization: Bearer <SECRET_KEY>
Content-Type: application/json

{
  "filename": "my-note.md",
  "content": "# My Note\n\nContent here...",
  "password": "optional-password"
}
```
Creates a new publication and returns the public URL.

### Update Existing File
```
PUT /api/update/:hash
Authorization: Bearer <SECRET_KEY>
Content-Type: application/json

{
  "content": "# Updated Content",
  "password": "optional-new-password"
}
```
Updates content while preserving the URL.

### Delete Publication
```
DELETE /api/delete/:hash
Authorization: Bearer <SECRET_KEY>
```
Removes a publication.

## Plugin Configuration

After installation, configure the Obsidian plugin:

1. Open Obsidian Settings → Web Publish
2. Set **API URL** to `https://your-domain.com/api`
3. Set **Secret Key** to the key displayed after installation
4. Save and test with a sample note

## Management Commands

```bash
# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f app
docker compose logs -f nginx

# Restart services
docker compose restart

# Stop services
docker compose down

# Start services
docker compose up -d

# Check service status
docker compose ps

# Rebuild after changes
docker compose build
docker compose up -d
```

## SSL Certificate Renewal

Certificates auto-renew via the certbot container. To manually renew:

```bash
docker compose run --rm certbot renew
docker compose restart nginx
```

## Data Storage

Publications are stored in Docker volumes:
- `app_data` — Published notes and metadata
- `certbot_conf` — SSL certificates
- `certbot_www` — ACME challenge files

To backup your data:
```bash
docker run --rm -v obsidian-pub-server_app_data:/data -v $(pwd):/backup alpine tar czf /backup/publications-backup.tar.gz -C /data .
```

## Security Considerations

- Keep your `SECRET_KEY` private and secure
- Use strong passwords for protected publications
- Regularly update Docker images
- Monitor access logs for suspicious activity
- Consider firewall rules to restrict access
- Back up your data regularly

## Troubleshooting

### Certificate Issues

If SSL certificate fails to obtain:
- Verify DNS points to your server: `dig +short your-domain.com`
- Check ports 80/443 are open: `sudo ufw status`
- View certbot logs: `docker compose logs certbot`

### Connection Issues

If the server is unreachable:
- Check nginx is running: `docker compose ps nginx`
- View nginx logs: `docker compose logs nginx`
- Test locally: `curl http://localhost:3000/api/health`

### Application Errors

If publications fail:
- Check app logs: `docker compose logs app`
- Verify SECRET_KEY matches plugin configuration
- Ensure content size is within limits



## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## Support

- **Server issues** — Open an issue in this repository
- **Plugin issues** — Visit [obsidian-pub-plugin](https://github.com/IvanShishkin/obsidian-pub-plugin)

## License

MIT License

---

**Enjoy publishing your notes with full control over your data! ❤️**