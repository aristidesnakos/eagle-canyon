#!/bin/bash
# contact sheet of the 6 views in DIR at fog F: tools/sheet.sh DIR F OUT.jpg
cd "$1" && ffmpeg -loglevel error -y -i view1-fog$2.png -i view2-fog$2.png -i view3-fog$2.png -i view4-fog$2.png -i view5-fog$2.png -i view6-fog$2.png -filter_complex "[0][1][2]hstack=3[a];[3][4][5]hstack=3[b];[a][b]vstack,scale=1920:-1" "$3"
