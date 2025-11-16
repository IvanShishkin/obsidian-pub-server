#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Obsidian Pub Server Update Script   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}Error: git is not installed${NC}"
    exit 1
fi

# Check if docker compose is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed${NC}"
    exit 1
fi

# Function to check if there are local changes
check_local_changes() {
    if [[ -n $(git status --porcelain) ]]; then
        echo -e "${YELLOW}Warning: You have local changes${NC}"
        git status --short
        echo ""
        read -p "Do you want to stash local changes before updating? (y/n): " stash_choice
        if [[ "$stash_choice" =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}Stashing local changes...${NC}"
            git stash push -m "Auto-stash before update $(date '+%Y-%m-%d %H:%M:%S')"
            echo -e "${GREEN}Changes stashed successfully${NC}"
        else
            echo -e "${YELLOW}Proceeding without stashing. This may cause conflicts.${NC}"
        fi
    fi
}

# Function to pull latest changes
pull_updates() {
    echo -e "${BLUE}Fetching updates from remote repository...${NC}"
    git fetch origin

    # Get current branch
    CURRENT_BRANCH=$(git branch --show-current)
    echo -e "${BLUE}Current branch: ${CURRENT_BRANCH}${NC}"

    # Check if there are updates
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/$CURRENT_BRANCH)

    if [ "$LOCAL" = "$REMOTE" ]; then
        echo -e "${GREEN}Already up to date!${NC}"
        return 1
    fi

    echo -e "${YELLOW}Updates available. Pulling changes...${NC}"
    git pull origin $CURRENT_BRANCH

    echo -e "${GREEN}Code updated successfully${NC}"
    return 0
}

# Function to backup data
backup_data() {
    echo -e "${BLUE}Creating backup of current data...${NC}"
    BACKUP_DIR="./backups"
    BACKUP_FILE="backup_$(date '+%Y%m%d_%H%M%S').tar.gz"

    mkdir -p "$BACKUP_DIR"

    if docker volume ls | grep -q "obsidian-pub-server_app_data"; then
        docker run --rm \
            -v obsidian-pub-server_app_data:/data:ro \
            -v "$(pwd)/$BACKUP_DIR":/backup \
            alpine tar czf "/backup/$BACKUP_FILE" -C /data . 2>/dev/null || true

        if [ -f "$BACKUP_DIR/$BACKUP_FILE" ]; then
            echo -e "${GREEN}Backup created: $BACKUP_DIR/$BACKUP_FILE${NC}"
        else
            echo -e "${YELLOW}Warning: Could not create backup (volume may be empty)${NC}"
        fi
    else
        echo -e "${YELLOW}Warning: Data volume not found, skipping backup${NC}"
    fi
}

# Function to rebuild and restart containers
rebuild_containers() {
    echo -e "${BLUE}Stopping containers...${NC}"
    docker compose down

    echo -e "${BLUE}Rebuilding containers (this may take a while)...${NC}"
    docker compose build --no-cache

    echo -e "${BLUE}Starting containers...${NC}"
    docker compose up -d

    echo -e "${GREEN}Containers rebuilt and started${NC}"
}

# Function to check health
check_health() {
    echo -e "${BLUE}Waiting for services to start...${NC}"
    sleep 10

    echo -e "${BLUE}Checking application health...${NC}"

    # Wait for health check (max 60 seconds)
    for i in {1..12}; do
        if docker compose exec -T app wget --no-verbose --tries=1 --spider http://localhost:3000/api/health 2>/dev/null; then
            echo -e "${GREEN}Application is healthy!${NC}"
            return 0
        fi
        echo "Waiting for application to be ready... ($i/12)"
        sleep 5
    done

    echo -e "${RED}Warning: Health check failed. Check logs with: docker compose logs app${NC}"
    return 1
}

# Function to show container status
show_status() {
    echo ""
    echo -e "${BLUE}Container Status:${NC}"
    docker compose ps
}

# Function to clean up old images
cleanup_old_images() {
    echo -e "${BLUE}Cleaning up old Docker images...${NC}"
    docker image prune -f
    echo -e "${GREEN}Cleanup complete${NC}"
}

# Main update process
main() {
    echo -e "${BLUE}Starting update process...${NC}"
    echo ""

    # Step 1: Check for local changes
    echo -e "${BLUE}[1/6] Checking for local changes...${NC}"
    check_local_changes
    echo ""

    # Step 2: Pull updates
    echo -e "${BLUE}[2/6] Pulling updates from git...${NC}"
    if ! pull_updates; then
        read -p "No updates found. Do you want to rebuild containers anyway? (y/n): " rebuild_choice
        if [[ ! "$rebuild_choice" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}Update process completed. No changes made.${NC}"
            exit 0
        fi
    fi
    echo ""

    # Step 3: Backup data
    echo -e "${BLUE}[3/6] Backing up data...${NC}"
    read -p "Do you want to backup data before updating? (y/n): " backup_choice
    if [[ "$backup_choice" =~ ^[Yy]$ ]]; then
        backup_data
    else
        echo -e "${YELLOW}Skipping backup${NC}"
    fi
    echo ""

    # Step 4: Rebuild containers
    echo -e "${BLUE}[4/6] Rebuilding containers...${NC}"
    rebuild_containers
    echo ""

    # Step 5: Health check
    echo -e "${BLUE}[5/6] Performing health check...${NC}"
    check_health
    echo ""

    # Step 6: Cleanup
    echo -e "${BLUE}[6/6] Cleaning up...${NC}"
    read -p "Do you want to remove old Docker images? (y/n): " cleanup_choice
    if [[ "$cleanup_choice" =~ ^[Yy]$ ]]; then
        cleanup_old_images
    fi
    echo ""

    # Show final status
    show_status

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}   Update completed successfully!      ${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "View logs: ${BLUE}docker compose logs -f${NC}"
    echo -e "Check status: ${BLUE}docker compose ps${NC}"
}

# Parse command line arguments
case "${1:-}" in
    --force)
        echo -e "${YELLOW}Force update mode${NC}"
        check_local_changes
        pull_updates || true
        backup_data
        rebuild_containers
        check_health
        cleanup_old_images
        show_status
        ;;
    --quick)
        echo -e "${YELLOW}Quick update mode (no prompts)${NC}"
        pull_updates || true
        rebuild_containers
        check_health
        show_status
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --force    Force update with backup and cleanup (no prompts)"
        echo "  --quick    Quick update without backup or cleanup"
        echo "  --help     Show this help message"
        echo ""
        echo "Without options, the script runs interactively."
        ;;
    *)
        main
        ;;
esac