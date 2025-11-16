#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "╔════════════════════════════════════════════╗"
echo "║     Obsidian Publish Server Installer      ║"
echo "╚════════════════════════════════════════════╝"
echo -e "${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo ./install.sh)${NC}"
  exit 1
fi

# Function to install Docker
install_docker() {
  echo -e "${GREEN}Installing Docker...${NC}"
  echo "This may take a few minutes."

  # Remove old versions if any
  apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

  # Update package index
  apt-get update

  # Install prerequisites
  apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

  # Add Docker's official GPG key
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  # Set up repository
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  # Install Docker Engine
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  # Start and enable Docker
  systemctl start docker
  systemctl enable docker

  echo -e "${GREEN}✓ Docker installed successfully${NC}"
}

# Check and install Docker if needed
echo -e "${GREEN}Step 1: Checking Docker installation${NC}"
echo "--------------------------------------"

if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Docker is not installed.${NC}"
  read -p "Do you want to install Docker automatically? (Y/n) " install_docker_choice
  if [ "$install_docker_choice" != "N" ] && [ "$install_docker_choice" != "n" ]; then
    install_docker
  else
    echo -e "${RED}Docker is required to continue. Please install Docker manually.${NC}"
    echo "Visit: https://docs.docker.com/engine/install/"
    exit 1
  fi
else
  echo "✓ Docker is installed"
  docker --version
fi

# Check if docker compose is available
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}Docker Compose plugin is not available.${NC}"
  read -p "Do you want to install Docker Compose plugin? (Y/n) " install_compose_choice
  if [ "$install_compose_choice" != "N" ] && [ "$install_compose_choice" != "n" ]; then
    apt-get update
    apt-get install -y docker-compose-plugin
    echo -e "${GREEN}✓ Docker Compose plugin installed${NC}"
  else
    echo -e "${RED}Docker Compose is required to continue.${NC}"
    exit 1
  fi
else
  echo "✓ Docker Compose is available"
  docker compose version
fi

# Verify Docker is running
if ! systemctl is-active --quiet docker; then
  echo "Starting Docker service..."
  systemctl start docker
  systemctl enable docker
fi
echo "✓ Docker service is running"

echo ""

# Check if .env already exists
if [ -f .env ]; then
  echo -e "${YELLOW}Warning: .env file already exists.${NC}"
  read -p "Do you want to reconfigure? (y/N) " overwrite
  if [ "$overwrite" != "Y" ] && [ "$overwrite" != "y" ]; then
    echo "Using existing .env file."
    # Load existing values
    source .env
    if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ] || [ -z "$SECRET_KEY" ]; then
      echo -e "${RED}Error: Existing .env file is incomplete.${NC}"
      exit 1
    fi
    echo "Domain: $DOMAIN"
    echo "Email: $EMAIL"
    SKIP_ENV_SETUP=true
  else
    SKIP_ENV_SETUP=false
  fi
else
  SKIP_ENV_SETUP=false
fi

if [ "$SKIP_ENV_SETUP" = false ]; then
  echo -e "${GREEN}Step 2: Configuration${NC}"
  echo "---------------------"

  # Get domain from user
  while true; do
    read -p "Enter your domain (e.g., publish.example.com): " DOMAIN
    if [ -n "$DOMAIN" ]; then
      # Basic domain validation
      if [[ "$DOMAIN" =~ ^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        break
      else
        echo -e "${RED}Invalid domain format. Please try again.${NC}"
      fi
    else
      echo -e "${RED}Domain cannot be empty.${NC}"
    fi
  done

  # Get email from user
  while true; do
    read -p "Enter your email (for Let's Encrypt notifications): " EMAIL
    if [ -n "$EMAIL" ]; then
      # Basic email validation
      if [[ "$EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        break
      else
        echo -e "${RED}Invalid email format. Please try again.${NC}"
      fi
    else
      echo -e "${RED}Email cannot be empty.${NC}"
    fi
  done

  echo ""
  echo -e "${GREEN}Step 3: Generating secrets${NC}"
  echo "---------------------------"

  # Generate secrets
  SECRET_KEY=$(openssl rand -hex 32)
  SESSION_SECRET=$(openssl rand -hex 32)

  echo "✓ Generated SECRET_KEY"
  echo "✓ Generated SESSION_SECRET"

  echo ""
  echo -e "${GREEN}Step 4: Creating .env file${NC}"
  echo "---------------------------"

  # Create .env file
  cat > .env << EOF
# Server Configuration
NODE_ENV=production
PORT=3000

# Authentication
SECRET_KEY=${SECRET_KEY}

# Domain Configuration
DOMAIN=${DOMAIN}
EMAIL=${EMAIL}

# Session
SESSION_SECRET=${SESSION_SECRET}

# Limits
MAX_CONTENT_SIZE=10485760
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
RATE_LIMIT_PUBLIC=1000
RATE_LIMIT_PASSWORD=5

# Security
CORS_ORIGINS=*
BCRYPT_ROUNDS=12
EOF

  echo "✓ Created .env file"
fi

echo ""
echo -e "${GREEN}Step 5: Setting up SSL certificate${NC}"
echo "------------------------------------"

# Create certbot directories
mkdir -p ./certbot/conf
mkdir -p ./certbot/www

# Download TLS parameters
if [ ! -e "./certbot/conf/options-ssl-nginx.conf" ] || [ ! -e "./certbot/conf/ssl-dhparams.pem" ]; then
  echo "Downloading recommended TLS parameters..."
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf > "./certbot/conf/options-ssl-nginx.conf"
  curl -s https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem > "./certbot/conf/ssl-dhparams.pem"
  echo "✓ Downloaded TLS parameters"
fi

# Check if certificate already exists
CERT_EXISTS=false
if [ -f "./certbot/conf/live/$DOMAIN/fullchain.pem" ] && [ -f "./certbot/conf/live/$DOMAIN/privkey.pem" ]; then
  CERT_EXISTS=true
  echo -e "${GREEN}✓ SSL certificate already exists for $DOMAIN${NC}"
  read -p "Do you want to renew it? (y/N) " renew_cert
  if [ "$renew_cert" != "Y" ] && [ "$renew_cert" != "y" ]; then
    echo "Using existing certificate."
  else
    CERT_EXISTS=false
  fi
fi

# Build images first (needed for both paths)
echo ""
echo -e "${GREEN}Step 6: Building Docker images${NC}"
echo "-------------------------------"
docker compose build --quiet
echo "✓ Built Docker images"

if [ "$CERT_EXISTS" = false ]; then
  # Use HTTP-only config for initial certificate request
  echo ""
  echo "Configuring nginx for certificate validation (HTTP only)..."

  # Temporarily replace the template with HTTP-only version
  if [ -f "./nginx/templates/default.conf.template.http-only" ]; then
    cp ./nginx/templates/default.conf.template ./nginx/templates/default.conf.template.ssl
    cp ./nginx/templates/default.conf.template.http-only ./nginx/templates/default.conf.template
    RESTORE_SSL_TEMPLATE=true
  else
    # Create HTTP-only template inline
    cat > ./nginx/templates/default.conf.template << 'HTTPEOF'
server {
    listen 80;
    server_name ${DOMAIN};
    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Waiting for SSL certificate...';
        add_header Content-Type text/plain;
    }
}
HTTPEOF
    RESTORE_SSL_TEMPLATE=false
  fi

  # Rebuild nginx with HTTP-only config
  echo "Building nginx image..."
  docker compose build nginx --quiet

  # Start nginx (HTTP only)
  echo ""
  echo -e "${GREEN}Step 7: Starting nginx for certificate validation${NC}"
  echo "--------------------------------------------------"
  docker compose up -d nginx
  echo "Waiting for nginx to start..."
  sleep 5

  # Verify nginx is running
  if ! docker compose ps nginx | grep -q "Up"; then
    echo -e "${RED}Error: nginx failed to start${NC}"
    docker logs obsidian-publish-nginx --tail 20
    exit 1
  fi
  echo "✓ nginx is running"

  # Request real certificate
  echo ""
  echo -e "${GREEN}Step 8: Obtaining SSL certificate${NC}"
  echo "-----------------------------------"
  echo "Requesting Let's Encrypt certificate for $DOMAIN..."
  echo "This may take a moment..."

  docker compose run --rm --entrypoint "\
    certbot certonly --webroot -w /var/www/certbot \
      --email $EMAIL \
      -d $DOMAIN \
      --rsa-key-size 4096 \
      --agree-tos \
      --non-interactive" certbot

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ SSL certificate obtained successfully!${NC}"
  else
    echo -e "${RED}Failed to obtain SSL certificate.${NC}"
    echo "Please check that:"
    echo "  - Your domain $DOMAIN points to this server"
    echo "  - Ports 80 and 443 are open"
    echo "  - Your firewall allows incoming connections"
    docker compose down
    exit 1
  fi

  # Restore SSL template
  echo ""
  echo "Configuring nginx with SSL..."
  if [ "$RESTORE_SSL_TEMPLATE" = true ]; then
    cp ./nginx/templates/default.conf.template.ssl ./nginx/templates/default.conf.template
    rm -f ./nginx/templates/default.conf.template.ssl
  else
    # Restore full SSL template
    cat > ./nginx/templates/default.conf.template << 'SSLEOF'
server {
    listen 80;
    server_name ${DOMAIN};
    server_tokens off;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name ${DOMAIN};
    server_tokens off;

    client_max_body_size 100M;

    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 30s;
        proxy_connect_timeout 30s;
    }
}
SSLEOF
  fi

  # Rebuild nginx with SSL config
  echo "Rebuilding nginx with SSL support..."
  docker compose build nginx --quiet

  # Restart nginx with SSL certificate
  echo "Restarting nginx with SSL certificate..."
  docker compose up -d --force-recreate nginx
  sleep 5
else
  echo ""
  echo -e "${GREEN}Step 7: Skipping certificate issuance${NC}"
  echo "---------------------------------------"
  echo "Using existing certificate."
fi

# Start all services
echo ""
echo -e "${GREEN}Step 9: Starting all services${NC}"
echo "------------------------------"
docker compose up -d
echo "✓ All services started"

# Wait for health check
echo "Waiting for application to be healthy..."
sleep 15

# Check if everything is running
if docker compose ps | grep -q "healthy"; then
  echo -e "${GREEN}✓ Application is healthy and running!${NC}"
else
  echo -e "${YELLOW}Warning: Application may still be starting up.${NC}"
  echo "Check status with: docker compose ps"
fi

# Final output
echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo -e "${GREEN}         Installation Complete!             ${NC}"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo -e "${BLUE}Your Obsidian Publish Server is now running!${NC}"
echo ""
echo "Connection Details:"
echo "-------------------"
echo "API URL:      https://${DOMAIN}/api"
echo "Health Check: https://${DOMAIN}/api/health"
echo ""
echo "Secret Key (save this!):"
echo "-------------------------"
echo "${SECRET_KEY}"
echo ""
echo -e "${YELLOW}IMPORTANT: Save your SECRET_KEY securely!${NC}"
echo "You will need it to configure the Obsidian plugin."
echo ""
echo "Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  Stop services:    docker compose down"
echo "  Restart services: docker compose restart"
echo "  Check status:     docker compose ps"
echo ""
echo -e "${GREEN}Thank you for using Obsidian Publish Server!${NC}"