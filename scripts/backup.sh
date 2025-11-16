#!/bin/bash

# Backup script for Obsidian Publish Server
# Creates timestamped backups of publication data

set -e

# Configuration
BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATA_DIR="${DATA_DIR:-./data}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_NAME="obsidian_publish_backup_${TIMESTAMP}.tar.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
  echo "Error: Data directory $DATA_DIR does not exist"
  exit 1
fi

echo "Starting backup..."
echo "Source: $DATA_DIR"
echo "Destination: $BACKUP_DIR/$BACKUP_NAME"

# Create compressed archive
tar -czf "$BACKUP_DIR/$BACKUP_NAME" -C "$DATA_DIR" .

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
echo "Backup created successfully: $BACKUP_NAME ($BACKUP_SIZE)"

# Remove old backups
echo "Removing backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "obsidian_publish_backup_*.tar.gz" -type f -mtime +$RETENTION_DAYS -delete

# Count remaining backups
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/obsidian_publish_backup_*.tar.gz 2>/dev/null | wc -l)
echo "Total backups: $BACKUP_COUNT"

# Optional: Upload to S3 (uncomment and configure)
# if [ -n "$S3_BUCKET" ]; then
#   echo "Uploading to S3..."
#   aws s3 cp "$BACKUP_DIR/$BACKUP_NAME" "s3://$S3_BUCKET/backups/$BACKUP_NAME"
#   echo "Uploaded to S3 successfully"
# fi

echo "Backup completed successfully!"
