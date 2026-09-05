---
target: FraXtal UI ergonomics (src/components)
total_score: 13
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-09-04T15-00-59Z
slug: src-components
---
# Score de sante design: 13/40 (Poor)

## Verdict specificite design
Panneau de reglages dev generique en theme sombre, pas un "instrument audiovisuel". Layout 3-colonnes IDE/DAW standard, labels math bruts, aucune personnalite typographique. Seule idee vraiment instrument (RANDOMIZE -> morph genere sur timeline) noyee au meme poids visuel que OPEN/SAVE/EXPORT/quitter.

Preuves detecteur: scan statique propre (0 finding), injection live: 50-58 anti-patterns (texte 10px partout, contraste 3.0:1 vs 4.5:1 requis, palette cyan neon recurrente, hierarchie typo plate, panneau droit non-scrollable a fenetre reduite, chevauchement texte timeline/play-button).

## Ce qui marche
- Timeline.tsx: perf scrub (cache geometrie, rAF-batch, transform-only paint)
- presets/registry.ts: 5 presets = compositions completes (camera+couleur+keyframes)
- randomizeWithMotion: RANDOMIZE pose un morph A->B anime, pas un changement statique

## Problemes prioritaires
[P0] Aucun undo/redo - RANDOMIZE/PRESETS ecrasent tout sans confirmation (applyPreset.ts clearAllKeyframes() inconditionnel)
[P0] Clic simple = recentrage camera silencieux + zoom sans plafond (FractalViewport.tsx handlePointerUp) - cause directe du "je me suis perdu"
[P1] Keyframe dot illisible hors fenetre 0.001s, aucune explication in-app (ParameterPanel.tsx KeyframeDot)
[P1] Texte <11px + contraste 3.0:1 + panneau droit non-scrollable (detecteur, confirme)
[P2] Play/pause (StatusBar) spatialement deconnecte de la Timeline qu'il controle
[P3] Vocabulaire scientifique (Bailout/C Real/Power) contredit l'ambition "instrument pas outil"

## Personas
Jordan: mur de sliders sans guidance, RANDOMIZE meme poids que quitter, recentrage silencieux au 1er clic
Riley: PRESETS efface tout sans confirm, double-clic keyframe = suppression irreversible, zoom sans plafond
Sam: contraste 3.0:1 mesure, etat keyframe porte uniquement par la couleur, pas de focus visible sur sliders

## Observations mineures
- RESET VIEW toujours visible meme camera par defaut
- Resolution/FPS statiques sans lien vers reglage
- Palette Random non distinguee des swatches statiques avant clic
