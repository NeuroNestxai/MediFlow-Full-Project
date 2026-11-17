#!/usr/bin/env bash
# Builds OSRM routing data for Oman (car profile, MLD) into infra/osrm/data.
# Source: Geofabrik GCC-states extract (contains Oman), clipped to Oman's bounding box with osmium.
# Run once on a machine with ~8 GB RAM, then enable ROUTING_PROVIDER=osrm and the "osrm" compose profile.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data && cd data
curl -fL -o gcc-states-latest.osm.pbf https://download.geofabrik.de/asia/gcc-states-latest.osm.pbf
docker run --rm -v "$PWD:/data" stefda/osmium-tool osmium extract -b 51.8,16.6,59.9,26.5 /data/gcc-states-latest.osm.pbf -o /data/oman-latest.osm.pbf --overwrite
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.25.0 osrm-extract -p /opt/car.lua /data/oman-latest.osm.pbf
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.25.0 osrm-partition /data/oman-latest.osrm
docker run --rm -t -v "$PWD:/data" osrm/osrm-backend:v5.25.0 osrm-customize /data/oman-latest.osrm
echo "OSRM data ready in $(pwd)"
