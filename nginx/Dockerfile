FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Create directories
RUN mkdir -p /var/www/certbot

# Copy template
COPY templates/default.conf.template /etc/nginx/templates/default.conf.template

# Copy entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
