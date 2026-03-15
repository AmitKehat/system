#!/bin/bash
echo "Switching to PAPER trading..."
rm -f .env
ln -s .env.paper .env
echo "Active: $(readlink .env)"
./dc.sh down
./dc.sh up -d
./dc.sh ps
