#!/bin/sh
set -e

# Process templates - replace ${DOMAIN} with actual value
if [ -d /etc/nginx/templates ]; then
  for template in /etc/nginx/templates/*.template; do
    if [ -f "$template" ]; then
      output="/etc/nginx/conf.d/$(basename "$template" .template)"
      envsubst '${DOMAIN}' < "$template" > "$output"
      echo "Generated $output from $template"
    fi
  done
fi

exec "$@"
