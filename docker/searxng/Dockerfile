FROM searxng/searxng:latest

# /etc/searxng is declared as a volume by the upstream image. Store Synapse's
# immutable configuration outside that volume so an old anonymous volume can
# never mask it after a container recreation.
COPY --chmod=0644 settings.yml /usr/local/searxng/synapse-settings.yml

# The configuration is readable but never writable by the service.
USER searxng
