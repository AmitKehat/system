#!/bin/bash
# Wrapper for docker compose with multiple env files
docker compose --env-file .env.base --env-file .env "$@"
