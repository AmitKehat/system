#!/bin/bash
echo "WARNING: Switching to LIVE trading!"
read -p "Type 'yes' to confirm: " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 1
fi
rm -f .env
ln -s .env.live .env
echo "Active: $(readlink .env)"
./dc.sh down
./dc.sh up -d
./dc.sh ps
