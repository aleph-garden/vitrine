```mermaid
gantt

dateFormat YYYY-MM-DD

axisFormat %d.%m.%Y

title Sanierung in Blankenbach

todayMarker stroke-width:5px,stroke:#0f0,opacity:0.5

  

section Abriss

Fußböden entfernen :done, fliesen, 2022-11-11, 2022-12-07

Tapeten entfernen :done, tapeten, 2022-11-11, 1w

Estrich entfernen :done, estrichalt, 2023-01-20, 2023-02-15

Arbeitszimmer entkernen :done, azentk, 2022-12-10, 3w

Badezimmer OG entkernen :done, badogentk, 2022-12-10, 2023-03-05

Abriss fertiggestellt :milestone, after badogentk

  

section Maurer-Arbeiten

Wanddurchbruch erstellen :active, 2023-03-04, 2023-03-29

Heizkörpernischen zumauern :2023-03-25, 3d

Glasbausteine entfernen :2023-03-25, 5d

Türstürze höher setzen :2023-04-10, 10d

  

section Innenarbeiten

Elektroplan fertigstellen :milestone, 2023-03-21, 1d

Elektrik OG neu verlegen :elog, 2023-03-22, 20d

Elektrik EG neu verlegen :eleg, after elog, 10d

Decken neu verputzen :deckenneu, after eleg, 3d

Innenwände verputzen :innenputz, after sanroh deckenneu, 14d

Innenwände fertig verputzen :innenputzfertig, after fensterein, 3d

Innen fertig für Estrich :milestone, after innenputz

  

Bodenbeläge :boden, after estrichtrocknen, 2w

Sanitärinstallationen :sanitär, after boden, 1w

Tapezieren/Streichen :tapstreich, after boden, 1w

Neue Innentüren einbauen :innentuer, after boden, 1w

  

section Lüftungsanlage

Kernbohrungen herstellen :durchluft, after putzneu, 3d

Lüftungsanlagen einbauen :after durchluft, 1w

  

section Beauftragte Arbeiten

Fenster anfragen :active, fenstan, 2023-02-24, 2023-03-25

Fenster beauftragen :crit, milestone, after fenstan

Fenster ausbauen :crit, fensteraus, 2023-06-12, 12d

Neue Fenster einbauen :crit, fensterein, after fensteraus, 4d

  

Sanitär/Heizung anfragen :done, heizungan, 2022-12-23, 2023-02-23

Sanitär/Heizung beauftragen :crit, milestone, after heizungan, 45d

Sanitärrohinstallation :sanroh, 2023-04-30, 7d

  

Estrich anfragen :active, estrichan, 2022-12-10, 2023-03-16

Estrich beauftragen :crit, milestone, after estrichan, 10d

Bodendämmung einbringen :bodendamm, after innenputzfertig, 1d

Fußbodenheizung einbauen :fussbodenheizung, after bodendamm, 5d

Estrich einbringen :estrichneu, after fussbodenheizung, 2d

Estrich trocknen :estrichtrocknen, after estrichneu, 28d

  

Wärmedämmung anfragen :active, wdvsan, 2023-02-23, 2023-03-25

Dämmung beauftragen :crit, milestone, after wdvsan

WDVS anbringen :wdvs, 2023-07-15, 14d

Außen neu verputzen :putzneu, after wdvs, 1w
```
