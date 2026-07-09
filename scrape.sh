MEET_ID="2026CSA"

# TODO: fix path to ./results
wget -r -np -k -p -e robots=off \
  "https://meetresults.greensboroaquaticcenter.com/${MEET_ID}/"
tar -czf "${MEET_ID}_$(date +%Y%m%d%H%M%S).tar.gz" "meetresults.greensboroaquaticcenter.com/${MEET_ID}"
