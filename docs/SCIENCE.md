# Scientific scope and limitations

Ce jalon ajoute des calculs théoriques, pas une certification de construction, de fonction ou de réussite expérimentale. Le moteur est propre au projet ; la carte et l’import GenBank continuent à réutiliser les composants TeselaGen. Les résultats sont éphémères et ne modifient pas les annotations.

## Traduction

Modes : six cadres sur une molécule déroulée une fois, ou sur une sélection explicite ; traduction d’une CDS annotée continue (éventuellement à travers l’origine). Sur le brin négatif, les segments sont d’abord joints en ordre de référence, puis le complément inverse est pris. /codon_start s’applique ensuite à l’extrémité 5′ de la CDS ainsi orientée.

Tables prises en charge : NCBI 1 et 11, sélection explicite en mode six cadres. Leurs affectations internes sont identiques ; leurs initiateurs autorisés diffèrent. Les initiateurs alternatifs ne deviennent M que dans une CDS commençant au premier codon. Les autres tables sont refusées. Pour une CDS, /transl_table et /codon_start sont lus dans les qualifications. Défauts GenBank : 1 et 1, avec avertissement pour la table absente. Un paramètre archivé après édition doit être redéfini explicitement avant recalcul, plutôt qu’être implicitement remplacé par une valeur par défaut.

Triplets ambigus : traduction unique si toutes leurs expansions donnent le même symbole, sinon X. Les alternatives B/Z/J ne sont pas utilisées. Stop = *. Les bases terminales incomplètes sont comptées, pas complétées arbitrairement. La traduction d’une région circulaire n’ajoute pas de codons au-delà de la fin du déroulement choisi ; une CDS à travers l’origine utilise sa localisation explicite.

Les qualifications /transl_except, /exception, /ribosomal_slippage, /pseudo ou /pseudogene présentes ou archivées bloquent le calcul CDS. Un stop interne, une absence de stop terminal ou d’initiateur reconnu, un décalage initial ou des X empêchent de présenter la structure comme une CDS complète compatible. Cela ne permet pas de conclure qu’un gène est faux biologiquement : ce modèle n’interprète pas toutes les exceptions. Le statut « À vérifier » n’est jamais levé automatiquement. /translation importé est comparé séparément, sans remplacement automatique. Seul le stop terminal calculé est exclu de cette comparaison.

L’affichage limite chaque aperçu à 6 000 caractères, explicitement signalés. Le FASTA protéique et le rapport JSON contiennent toute la traduction (y compris les stops indiqués dans l’en-tête).

## Restrictions

Catalogue propre de 16 spécificités factuelles vérifiées dans le tableau NEB, version `gin-schnaps-16-2026-10-12`. Il ne s’agit pas d’une redistribution de la base REBASE complète et ce n’est pas un catalogue exhaustif d’enzymes. Les noms ne distinguent pas les formulations commerciales HF/v2 de même spécificité ; aucun tampon, température, efficacité ou fournisseur n’est recommandé par le moteur.

Recherche des motifs dans les deux orientations, déduplication des palindromes, occurrences chevauchantes et à travers l’origine. Un site est **certain pour le motif** si chaque possibilité de chaque base de la matrice appartient au motif ; sinon il peut être possible par intersection des ensembles IUPAC. Une certitude de motif ne prédit pas une digestion réelle. Dès qu’un site possible intervient, aucun jeu unique de fragments n’est inventé.

Pour un motif de longueur k commençant en p, coupures interbases t et b relatives à son orientation :
- orientation directe : référence = p+t ; complément = p+b ;
- orientation inverse : référence = p+k-b ; complément = p+k-t.

Les coupures circulaires sont normalisées modulo la longueur tout en préservant le décalage réel entre brins. Les coupures hors d’un fragment linéaire ou nécessitant plus d’un tour d’une trop petite molécule restent des sites signalés, sans digestion supposée. Le moteur refuse également les géométries superposées, terminales ou produisant des fragments monocaténaires qu’il ne modélise pas.

Les fragments correspondent à un modèle de digestion complète par les enzymes cochées. Longueurs de chacun des deux brins séparées ; somme des longueurs sur chaque brin conservée. Extrémités franches, 5′ ou 3′ explicites, avec séquence écrite 5′→3′ et brin porteur. Les extrémités naturelles d’une matrice linéaire sont non renseignées, pas supposées franches. Des ambiguïtés dans un surplomb sont conservées en IUPAC, pas résolues en une séquence chimique unique.

Méthylation inconnue et non modélisée ; pas d’activité star, de digestion partielle, de cinétique ou d’inhibition. Les résultats ne sont pas des fragments chimiquement prêts à ligaturer. Pas de modèle de phosphorylation.

Maximum 10 000 sites ; dépassement = refus de l’analyse entière, jamais résultat tronqué présenté comme exhaustif. Les tables sont paginées par 100 sites ; le rapport JSON reste complet.

## Amorces et PCR

Deux amorces manuelles : nom, région d’hybridation et queue 5′ séparées, saisies 5′→3′. La saisie met en majuscules et retire les espaces, sans filtrer silencieusement les autres caractères invalides. Mode exact uniquement : matrice, régions et queues en A/C/G/T ; 8–200 nt pour l’hybridation et 0–500 nt pour la queue. Une région courte est signalée, pas déclarée bonne par le logiciel.

Recherche des sites des deux amorces dans les deux orientations, y compris à travers l’origine. Énumération des paires convergentes, y compris l’ordre inverse B/A et les produits où une même amorce s’hybride aux deux extrémités. Pas de choix automatique lorsqu’il existe plusieurs possibilités. Une ligne décrit une combinaison de sites et d’amorces ; deux combinaisons peuvent donner une séquence identique.

Les régions d’hybridation doivent être non chevauchantes et tenir dans un tour de matrice au maximum. Les produits qui impliqueraient des chevauchements ou plus d’un tour sont exclus et comptés ; les amorces divergentes sur une molécule linéaire ne forment pas de produit dans ce modèle. Bornes de taille explicites, queues incluses.

Produit écrit dans le sens de référence : queue de l’amorce directe + région de matrice encadrée par les amorces + complément inverse de la queue de l’amorce inverse. Les régions hybridantes sont incorporées dans le produit final ; le modèle impose leur correspondance exacte avec la matrice. Les mésappariements et substitutions introduites par une amorce ne sont pas modélisés.

Tm : **non calculée**, pas d’approximation de Wallace substituée à Primer3. Ni structures secondaires, ni dimères, ni efficacité, ni recherche génomique hors cible. Le résultat ne prédit pas une réussite expérimentale. Limites : 200 sites par amorce/orientation, 200 produits et 2 millions de bases cumulées ; au-delà, analyse refusée explicitement.

Les amorces sont conservées pendant la session de leur document, y compris lors du changement de vue. Elles ne constituent pas encore une bibliothèque persistante dans .sg.json. Le rapport JSON exporte les deux amorces, tous les paramètres, la matrice et les résultats ; le FASTA produit exporte seulement la séquence, sans transfert d’annotations parentales non validé.

## Références et données

Sources primaires consultées le 12 octobre 2026 :

- [NCBI Genetic Codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), tables 1 et 11 ; la page annonce une mise à jour au 23 septembre 2024.
- [NEB, Alphabetized List of Recognition Sequences](https://www.neb.com/en-us/tools-and-resources/selection-charts/alphabetized-list-of-recognition-specificities), spécificités et conventions de coupure, dont types IIS.
- [Biopython, Bio.Seq](https://biopython.org/docs/latest/api/Bio.Seq.html), traduction et complément inverse de référence. Oracle exécuté avec Biopython **1.86**, version explicite, distincte du moteur livré. Les fixtures, le générateur et les normalisations sont fournis.

Ces références définissent des conventions et des comparaisons ; elles ne sont pas une certification du logiciel par NCBI, NEB ou Biopython.
