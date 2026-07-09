MEET_ID="2026CSA"

wget -r -np -k -p -e robots=off \
  "https://meetresults.greensboroaquaticcenter.com/${MEET_ID}/"
tar -czf "${MEET_ID}_$(date +%Y%m%d%H%M%S).tar.gz" "results/${MEET_ID}"