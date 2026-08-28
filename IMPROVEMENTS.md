
# 1. Traduction en français
La première chose serait évidemment de prévoir une version française de l’interface, puisque ce sera la langue principale utilisée par le groupe actuel.
À terme, il pourrait même être intéressant de prévoir le multilingue si l’application devait un jour servir à d’autres assemblées ou à un périmètre plus large.
Par exemple le Norvégien, l'anglais, l'alllemand, le néérlandais, le polonais.
Et si il pouvait se localiser automatiquement en fonction de la langue de l'utilisateur ça serait trop bien.

# 2. Petit bug d’affichage en haut à gauche
Sur toutes les pages, je vois un petit chiffre « 2 » qui apparaît juste au-dessus des onglets avec les dates, en haut à gauche.
Je suppose qu’il s’agit simplement d’une petite donnée ou variable qui s’affiche par erreur.

# 3. Ajout des vols
La recherche par numéro de vol fonctionne très bien dans l’ensemble, et c’est vraiment pratique de ne devoir renseigner que le numéro du vol et la date.
J’ai toutefois remarqué un cas où toutes les informations ne sont pas récupérées : pour le vol SN2284 du dimanche 18 octobre, l’application retrouve bien le vol et le trajet, mais pas l’heure de départ, contrairement aux autres vols que j’ai ajoutés.
Cela pourrait peut-être être utile de voir si l’API ou la source utilisée permet de récupérer de façon plus systématique :
▫️l’heure de départ ;
▫️l’heure d’arrivée ;
▫️l’aéroport de départ ;
▫️l’aéroport d’arrivée ;
▫️éventuellement la compagnie aérienne.

# 4. Tri automatique des vols
Pour l’instant, les vols semblent s’afficher dans l’ordre dans lequel ils ont été ajoutés.
Je pense qu’il serait beaucoup plus intuitif de les classer automatiquement par heure de départ, du plus tôt au plus tard, pour chaque journée.
Dans la pratique, lorsqu’on cherche un vol, on se repère souvent davantage à l’heure qu’au numéro de vol. On pourrait donc imaginer un affichage du type :
15:20 – SN2283 – BRU → OSL
16:30 – DY1611 – BSL → OSL
18:40 – DY1247 – BRU → OSL
Le numéro de vol resterait bien sûr visible, mais l’heure deviendrait le premier critère de lecture et de tri.

# 5. Bouton « Ajouter » directement dans chaque section
Actuellement, il y a un bouton général « Add flight / car » en bas de la page.
Je pense qu’il serait plus intuitif de mettre un petit bouton « Ajouter » directement à droite du titre de chaque section :
Transport vers l’aéroport de départ | Ajouter
Vols | Ajouter
Transport depuis l’aéroport d’arrivée | Ajouter
Cela permettrait de comprendre immédiatement ce qu’on est en train d’ajouter, sans passer par un formulaire global.

# 6. Remplacer « Cars » par « Transport »
Je remplacerais « Cars to the airport » et « Cars from the arrival airport » par quelque chose de plus général :
« Transport vers l’aéroport de départ »
et
« Transport depuis l’aéroport d’arrivée »
Cela permettrait de conserver exactement les trois mêmes sections pour chaque journée :
Transport vers l’aéroport de départ
Vols
Transport depuis l’aéroport d’arrivée
Ce modèle fonctionne aussi bien pour l’aller que pour le retour.
Par exemple, le 15 octobre, « Transport vers l’aéroport de départ » correspondrait au trajet depuis la maison vers Bruxelles, Luxembourg, Bâle, etc.
Le 18 octobre, la même rubrique correspondrait au trajet depuis Brunstad vers OSL ou Torp.
Et « Transport depuis l’aéroport d’arrivée » fonctionnerait ensuite dans le sens inverse.
Cela évite donc d’avoir à créer quatre types de trajet différents.

# 7. Prévoir plusieurs modes de transport
Il serait également utile de ne pas limiter ces sections aux voitures.
Il pourrait y avoir, par exemple :
voiture privée, voiture de location, train, bus, navette BCC, taxi, personne venant chercher quelqu’un à l’aéroport, ou même une combinaison train + taxi, train + voiture, etc.
On pourrait éventuellement avoir un champ « Mode de transport » lors de l’ajout.
Pour une voiture, on aurait ensuite les champs spécifiques liés au conducteur, au nombre de places, aux passagers, etc.

# 8. Modification des passagers : comportement entre les dates
J’ai remarqué un petit comportement qui pourrait prêter à confusion.
Lorsque je clique sur « Edit passengers » pour mon véhicule du 15 octobre, la section d’édition des passagers s’ouvre en bas de la page.
Si je passe ensuite sur le 14 ou le 18 octobre, cette section reste affichée en bas de l’écran, alors que le véhicule en question n’existe pas sur ces journées.
Il me semblerait plus logique que cette section se ferme automatiquement dès qu’on change de date.

# 9. Ajouter un bouton « Fermer » dans l’édition des passagers
Dans cette même section, il n’y a actuellement que « Save passengers ».
Si quelqu’un ouvre la section simplement pour regarder et souhaite ensuite la fermer sans rien modifier, il n’est pas forcément évident qu’il faut cliquer sur « Save passengers ».
Je mettrais donc deux boutons :
« Enregistrer »
et
« Fermer » ou « Annuler »
Cela me paraît plus intuitif.

# 10. Bouton « Switch »
J’ai testé le bouton noir « Switch ». Si je comprends bien, il permet de déplacer un véhicule de « vers l’aéroport » à « depuis l’aéroport », ou inversement.
Je comprends l’intérêt si quelqu’un s’est trompé au moment de créer son trajet, mais je ne pense pas que « Switch » soit très intuitif pour un utilisateur qui découvre l’application.
Je verrais plutôt un bouton « Modifier ».
Celui-ci pourrait ouvrir une petite fenêtre permettant de modifier :
▫️la date ;
▫️le sens du trajet ;
▫️le point de départ ;
▫️l’heure ;
▫️les notes ;
▫️le nombre de places ;
▫️éventuellement le mode de transport.
Le changement de sens ferait alors simplement partie des options de modification.

# 11. Droits spécifiques pour les administrateurs
Je pense qu’il serait vraiment utile que certains administrateurs du groupe puissent ajouter ou modifier des informations au nom d’autres utilisateurs.
Aujourd’hui, si j’ajoute une voiture, elle est automatiquement créée sous mon nom, puisque Samferd m’identifie via mon compte Telegram.
C’est très logique pour un utilisateur normal, mais en pratique on va probablement rencontrer plusieurs situations où un administrateur connaît déjà les informations et souhaite les renseigner sans attendre que chaque conducteur le fasse lui-même.
Par exemple, un administrateur pourrait :
▫️créer un trajet en voiture au nom du conducteur ;
▫️ajouter les passagers connus ;
▫️inscrire quelqu’un sur un vol ;
▫️corriger une information ;
▫️aider une personne moins à l’aise avec la technologie.
Cela pourrait être particulièrement utile pour certains amis plus âgés qui ne vont pas forcément utiliser eux-mêmes toutes les fonctionnalités de l’application.

# 12. Statut du transport : confirmé, provisoire, annulé, complet
Cela me paraît assez important pour éviter précisément le problème que nous avons actuellement avec les sondages Telegram.
Une voiture peut apparaître comme disponible alors qu’en réalité son conducteur n’est pas encore certain de pouvoir l’utiliser.
Je prévoirais donc un statut, par exemple :
▫️Confirmé
▫️Provisoire
▫️Complet
▫️Annulé
Ainsi, quelqu’un pourrait immédiatement voir qu’une voiture existe potentiellement, mais qu’elle n’est pas encore garantie.
Cela éviterait beaucoup de malentendus.

# 13. Places disponibles et passagers
Idéalement, je pense que le nombre de places restantes devrait être calculé automatiquement à partir de la capacité du véhicule et des passagers confirmés.
Par exemple :
Capacité totale : 5
Conducteur : 1
Passagers confirmés : 3
Places restantes : 1
Cela éviterait qu’un nombre de « places libres » renseigné manuellement devienne faux après l’ajout ou le retrait d’un passager.
Il pourrait aussi être intéressant de distinguer :
▫️une demande de place ;
▫️une place confirmée.
Cela permettrait à quelqu’un de demander à rejoindre une voiture sans que la place soit automatiquement considérée comme réservée avant validation du conducteur.

# 14. Une vue « Mon trajet »
À terme, je pense qu’une vue synthétique personnelle pourrait être vraiment pratique.
Par exemple :
15 octobre
Maison → BRU
Voiture avec X – confirmé
BRU → OSL
SN2283 – 15:20 – confirmé
OSL → Brunstad
Voiture de location avec Y – en attente
Puis la même chose pour le retour.
Cela permettrait à chaque utilisateur de voir immédiatement s’il lui manque encore une partie de son trajet.

# 15. Sections repliables pour garder l’interface plus claire
Une dernière idée qui m’est venue ce matin et qui, je pense, pourrait être très intéressante du point de vue UX : faire en sorte que les trois grandes sections de chaque journée soient automatiquement repliées par défaut :
* Transport vers l’aéroport de départ
* Vols
* Transport depuis l’aéroport d’arrivée
L’utilisateur cliquerait simplement sur la section qui l’intéresse pour l’ouvrir et afficher son contenu.
Une fois ouverte, il serait également utile d’avoir un petit bouton permettant de la réduire à nouveau.
Je pense que cela rendrait l’application beaucoup plus lisible, surtout lorsqu’il commence à y avoir plusieurs vols, plusieurs véhicules et différents modes de transport. Sinon, la page devient rapidement assez longue et chargée, et il faut beaucoup faire défiler l’écran pour passer d’une partie du trajet à une autre.
Avec des sections repliables, chacun pourrait se concentrer uniquement sur l’élément qu’il cherche à organiser ou à consulter à ce moment-là, tout en gardant une vue beaucoup plus simple de l’ensemble de son itinéraire.

# 16. Notifications et rappels
À plus long terme, il pourrait aussi être intéressant d’avoir quelques rappels automatiques.
Par exemple, si quelqu’un a demandé une place dans une voiture mais que la situation reste « en attente » pendant plusieurs jours, l’application pourrait rappeler aux personnes concernées de confirmer ou d’annuler.
Même chose si un véhicule passe de « confirmé » à « annulé » : tous les passagers concernés pourraient être avertis automatiquement.

# 17. Prévoir plusieurs événements
Même si, pour l’instant, nous travaillons évidemment uniquement autour de cette conférence d’octobre, je pense qu’il pourrait être utile que la structure soit basée sur des « événements » ou « conférences ».
Cela permettrait ensuite de réutiliser exactement la même application pour une conférence des sœurs, une autre conférence des frères, un camp, etc., sans devoir recréer toute la logique.

# 18. Telegram à court terme, mais sans trop verrouiller l’architecture
Le fait d’utiliser Telegram pour l’authentification est très pratique pour le prototype actuel, et probablement la meilleure solution pour démarrer rapidement.
J’ai toutefois entendu dire que BCC souhaiterait à terme centraliser davantage ses applications et progressivement sortir de Telegram.
Ce n’est évidemment pas quelque chose dont il faut se préoccuper maintenant, mais si l’application devait un jour aller plus loin, ce serait probablement intéressant que Telegram reste surtout une couche d’accès/authentification, sans que toute la logique et les données soient dépendantes de Telegram.
Ainsi, le jour où il faudrait éventuellement utiliser un login BCC ou intégrer l’application dans leur propre environnement, le cœur de Samferd pourrait théoriquement rester le même.

# 19. Une éventuelle couche IA plus tard
Je pense également qu’une couche IA pourrait devenir intéressante une fois toutes ces données bien structurées.
Quelqu’un pourrait par exemple demander :
« Je pars de Nancy et je voudrais prendre un vol depuis Bruxelles. Quelles sont les possibilités ? »
ou :
« Qui prend le vol Norwegian de 18h40 ? »
ou :
« Est-ce qu’il reste une place dans une voiture qui part vers Bruxelles jeudi ? »
ou encore :
« Je prends le vol de 14h30 dimanche. Comment puis-je rentrer vers la Lorraine ? »
Mais pour moi, cette partie viendrait plutôt par-dessus la structure que tu es déjà en train de construire. Le plus important est d’abord d’avoir des données fiables et à jour sur les vols, les transports, les places disponibles et éventuellement les hébergements.

# 20. Hébergement à Brunstad
Dans une version plus complète, le même principe pourrait peut-être être étendu aux suites à Brunstad.
Par exemple :
Suite X
Responsable : Y
Capacité : 6
Occupants confirmés : 4
Places disponibles : 2
On pourrait ensuite demander une place, être ajouté par le responsable de la suite ou par un administrateur, etc.
C’est d’ailleurs l’un des besoins qui avait été évoqué auparavant, en parallèle du covoiturage.