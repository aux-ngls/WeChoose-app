import pickle
import re
from typing import Any

import pandas as pd
import requests


BOOK_SEEDS = [
    ("Dune", "Frank Herbert", ["Science-fiction", "Aventure"], ["politique", "ecologie", "desert", "empire", "prophetie"], 8.9),
    ("Piranesi", "Susanna Clarke", ["Fantastique", "Mystere"], ["maison", "memoire", "labyrinthe", "solitude", "statues"], 8.6),
    ("Circe", "Madeline Miller", ["Fantasy", "Mythologie"], ["magie", "exil", "dieux", "emancipation", "ile"], 8.4),
    ("The Name of the Wind", "Patrick Rothfuss", ["Fantasy", "Aventure"], ["magie", "musique", "universite", "legende"], 8.8),
    ("L'Etranger", "Albert Camus", ["Classique", "Litteraire"], ["absurde", "justice", "proces", "detachement"], 8.1),
    ("Pride and Prejudice", "Jane Austen", ["Classique", "Romance"], ["societe", "famille", "ironie", "mariage"], 8.7),
    ("1984", "George Orwell", ["Dystopie", "Politique"], ["surveillance", "langage", "pouvoir", "memoire"], 8.9),
    ("The Handmaid's Tale", "Margaret Atwood", ["Dystopie", "Feminisme"], ["theocratie", "corps", "memoire", "controle"], 8.3),
    ("Kafka on the Shore", "Haruki Murakami", ["Litteraire", "Fantastique"], ["reve", "identite", "fugue", "japon"], 8.2),
    ("Normal People", "Sally Rooney", ["Contemporain", "Romance"], ["amour", "classe", "jeunesse", "intimite"], 7.9),
    ("A Gentleman in Moscow", "Amor Towles", ["Historique", "Litteraire"], ["hotel", "russie", "elegance", "amitie"], 8.5),
    ("Persepolis", "Marjane Satrapi", ["Graphique", "Memoire"], ["iran", "exil", "famille", "politique"], 8.6),
    ("Educated", "Tara Westover", ["Memoire", "Non-fiction"], ["education", "famille", "rupture", "liberte"], 8.4),
    ("Sapiens", "Yuval Noah Harari", ["Essai", "Histoire"], ["humanite", "mythes", "societe", "science"], 8.2),
    ("Harry Potter and the Philosopher's Stone", "J. K. Rowling", ["Fantasy", "Jeunesse"], ["magie", "ecole", "amitie", "initiation"], 8.8),
    ("The Hobbit", "J. R. R. Tolkien", ["Fantasy", "Aventure"], ["quete", "dragon", "voyage", "courage"], 8.7),
    ("The Lord of the Rings", "J. R. R. Tolkien", ["Fantasy", "Epique"], ["anneau", "quete", "amitie", "guerre"], 9.1),
    ("The Left Hand of Darkness", "Ursula K. Le Guin", ["Science-fiction", "Politique"], ["genre", "diplomatie", "planete", "alterite"], 8.5),
    ("The Dispossessed", "Ursula K. Le Guin", ["Science-fiction", "Philosophie"], ["utopie", "anarchisme", "science", "societe"], 8.4),
    ("Neuromancer", "William Gibson", ["Science-fiction", "Cyberpunk"], ["ia", "reseau", "piratage", "noir"], 8.1),
    ("Foundation", "Isaac Asimov", ["Science-fiction", "Empire"], ["psychohistoire", "empire", "science", "politique"], 8.4),
    ("Fahrenheit 451", "Ray Bradbury", ["Dystopie", "Classique"], ["censure", "livres", "feu", "resistance"], 8.2),
    ("Brave New World", "Aldous Huxley", ["Dystopie", "Classique"], ["controle", "bonheur", "societe", "conditionnement"], 8.1),
    ("The Road", "Cormac McCarthy", ["Post-apocalyptique", "Litteraire"], ["pere", "fils", "survie", "monde"], 8.0),
    ("Beloved", "Toni Morrison", ["Litteraire", "Historique"], ["memoire", "esclavage", "famille", "fantomes"], 8.3),
    ("Song of Solomon", "Toni Morrison", ["Litteraire", "Famille"], ["identite", "heritage", "mythe", "memoire"], 8.1),
    ("The Great Gatsby", "F. Scott Fitzgerald", ["Classique", "Litteraire"], ["reve americain", "argent", "amour", "illusion"], 8.0),
    ("To Kill a Mockingbird", "Harper Lee", ["Classique", "Justice"], ["enfance", "racisme", "justice", "sud"], 8.8),
    ("The Catcher in the Rye", "J. D. Salinger", ["Classique", "Initiation"], ["adolescence", "solitude", "colere", "new york"], 7.8),
    ("One Hundred Years of Solitude", "Gabriel Garcia Marquez", ["Realisme magique", "Famille"], ["macondo", "memoire", "famille", "mythe"], 8.7),
    ("Love in the Time of Cholera", "Gabriel Garcia Marquez", ["Romance", "Litteraire"], ["amour", "temps", "attente", "caraibes"], 8.1),
    ("The Shadow of the Wind", "Carlos Ruiz Zafon", ["Mystere", "Litteraire"], ["barcelone", "livres", "secret", "enquete"], 8.6),
    ("The Book Thief", "Markus Zusak", ["Historique", "Jeunesse"], ["guerre", "lecture", "mort", "resistance"], 8.5),
    ("The Secret History", "Donna Tartt", ["Litteraire", "Mystere"], ["campus", "crime", "grec", "obsession"], 8.3),
    ("The Goldfinch", "Donna Tartt", ["Litteraire", "Initiation"], ["art", "deuil", "obsession", "new york"], 8.0),
    ("A Little Life", "Hanya Yanagihara", ["Contemporain", "Drame"], ["amitie", "trauma", "new york", "douleur"], 8.2),
    ("The Seven Husbands of Evelyn Hugo", "Taylor Jenkins Reid", ["Contemporain", "Romance"], ["hollywood", "secret", "celebrite", "amour"], 8.4),
    ("Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", ["Contemporain", "Amitie"], ["jeux video", "creation", "amitie", "ambition"], 8.2),
    ("Project Hail Mary", "Andy Weir", ["Science-fiction", "Aventure"], ["espace", "science", "survie", "contact"], 8.6),
    ("The Martian", "Andy Weir", ["Science-fiction", "Survie"], ["mars", "science", "humour", "ingenierie"], 8.4),
    ("Klara and the Sun", "Kazuo Ishiguro", ["Science-fiction", "Litteraire"], ["ia", "enfance", "amour", "solitude"], 7.9),
    ("Never Let Me Go", "Kazuo Ishiguro", ["Litteraire", "Dystopie"], ["memoire", "clones", "amour", "destin"], 8.1),
    ("The Remains of the Day", "Kazuo Ishiguro", ["Litteraire", "Historique"], ["devoir", "regret", "service", "memoire"], 8.2),
    ("Hamnet", "Maggie O'Farrell", ["Historique", "Famille"], ["deuil", "shakespeare", "famille", "creation"], 8.2),
    ("Wolf Hall", "Hilary Mantel", ["Historique", "Politique"], ["tudor", "pouvoir", "cromwell", "cour"], 8.3),
    ("The Night Circus", "Erin Morgenstern", ["Fantastique", "Romance"], ["cirque", "magie", "duel", "amour"], 8.0),
    ("The Starless Sea", "Erin Morgenstern", ["Fantastique", "Litteraire"], ["livres", "portes", "mythe", "labyrinthe"], 7.8),
    ("American Gods", "Neil Gaiman", ["Fantastique", "Mythologie"], ["dieux", "route", "amerique", "mythe"], 8.1),
    ("Good Omens", "Terry Pratchett", ["Fantastique", "Humour"], ["apocalypse", "ange", "demon", "satire"], 8.4),
    ("Mort", "Terry Pratchett", ["Fantasy", "Humour"], ["mort", "disque-monde", "apprentissage", "satire"], 8.2),
    ("The Color Purple", "Alice Walker", ["Classique", "Feminisme"], ["sororite", "violence", "voix", "liberte"], 8.3),
    ("The Bell Jar", "Sylvia Plath", ["Classique", "Litteraire"], ["depression", "identite", "feminite", "ecriture"], 8.0),
    ("Jane Eyre", "Charlotte Bronte", ["Classique", "Romance"], ["independance", "gothique", "amour", "secret"], 8.5),
    ("Wuthering Heights", "Emily Bronte", ["Classique", "Gothique"], ["passion", "vengeance", "lande", "famille"], 8.0),
    ("Frankenstein", "Mary Shelley", ["Classique", "Gothique"], ["creation", "monstre", "science", "responsabilite"], 8.2),
    ("Dracula", "Bram Stoker", ["Classique", "Horreur"], ["vampire", "gothique", "peur", "modernite"], 8.0),
    ("The Picture of Dorian Gray", "Oscar Wilde", ["Classique", "Gothique"], ["beaute", "morale", "art", "decadence"], 8.3),
    ("Crime and Punishment", "Fyodor Dostoevsky", ["Classique", "Philosophie"], ["culpabilite", "crime", "foi", "justice"], 8.8),
    ("The Brothers Karamazov", "Fyodor Dostoevsky", ["Classique", "Philosophie"], ["famille", "foi", "meurtre", "liberte"], 8.9),
    ("Anna Karenina", "Leo Tolstoy", ["Classique", "Romance"], ["amour", "societe", "famille", "destin"], 8.7),
    ("War and Peace", "Leo Tolstoy", ["Classique", "Historique"], ["guerre", "famille", "russie", "histoire"], 8.8),
    ("The Master and Margarita", "Mikhail Bulgakov", ["Classique", "Satire"], ["diable", "moscou", "art", "pouvoir"], 8.6),
    ("Things Fall Apart", "Chinua Achebe", ["Classique", "Historique"], ["colonisation", "tradition", "village", "rupture"], 8.0),
    ("Half of a Yellow Sun", "Chimamanda Ngozi Adichie", ["Historique", "Litteraire"], ["biafra", "guerre", "famille", "politique"], 8.2),
    ("Americanah", "Chimamanda Ngozi Adichie", ["Contemporain", "Identite"], ["migration", "race", "amour", "blog"], 8.1),
    ("Homegoing", "Yaa Gyasi", ["Historique", "Famille"], ["diaspora", "esclavage", "heritage", "generations"], 8.4),
    ("The Vanishing Half", "Brit Bennett", ["Contemporain", "Famille"], ["identite", "soeurs", "race", "secret"], 8.0),
    ("Pachinko", "Min Jin Lee", ["Historique", "Famille"], ["coree", "japon", "exil", "generations"], 8.4),
    ("A Tale for the Time Being", "Ruth Ozeki", ["Contemporain", "Litteraire"], ["journal", "temps", "japon", "memoire"], 8.0),
    ("The Overstory", "Richard Powers", ["Litteraire", "Ecologie"], ["arbres", "activisme", "nature", "destins"], 8.1),
    ("Cloud Atlas", "David Mitchell", ["Litteraire", "Speculatif"], ["reincarnation", "pouvoir", "temps", "recits"], 8.2),
    ("Station Eleven", "Emily St. John Mandel", ["Post-apocalyptique", "Litteraire"], ["pandemie", "art", "memoire", "survie"], 8.1),
    ("Sea of Tranquility", "Emily St. John Mandel", ["Science-fiction", "Litteraire"], ["temps", "simulation", "pandemie", "memoire"], 7.9),
    ("The Midnight Library", "Matt Haig", ["Fantastique", "Developpement"], ["choix", "regret", "vies", "bibliotheque"], 8.0),
    ("Anxious People", "Fredrik Backman", ["Contemporain", "Humour"], ["otage", "solitude", "empathie", "immeuble"], 8.2),
    ("A Man Called Ove", "Fredrik Backman", ["Contemporain", "Humour"], ["deuil", "voisinage", "colere", "tendresse"], 8.3),
    ("The House in the Cerulean Sea", "TJ Klune", ["Fantasy", "Feel-good"], ["enfants", "magie", "bureaucratie", "acceptation"], 8.3),
    ("Red, White & Royal Blue", "Casey McQuiston", ["Romance", "Contemporain"], ["politique", "amour", "queer", "humour"], 7.9),
    ("The Song of Achilles", "Madeline Miller", ["Mythologie", "Romance"], ["achille", "patrocle", "guerre", "destin"], 8.6),
    ("The Priory of the Orange Tree", "Samantha Shannon", ["Fantasy", "Epique"], ["dragon", "royaume", "magie", "politique"], 8.1),
    ("The Fifth Season", "N. K. Jemisin", ["Fantasy", "Dystopie"], ["terre", "catastrophe", "pouvoir", "maternite"], 8.4),
    ("The City We Became", "N. K. Jemisin", ["Fantasy", "Urbain"], ["new york", "ville", "identite", "monstre"], 7.7),
    ("A Game of Thrones", "George R. R. Martin", ["Fantasy", "Politique"], ["trone", "familles", "guerre", "intrigue"], 8.7),
    ("The Way of Kings", "Brandon Sanderson", ["Fantasy", "Epique"], ["guerre", "serments", "tempetes", "magie"], 8.8),
    ("Mistborn", "Brandon Sanderson", ["Fantasy", "Aventure"], ["metal", "revolution", "magie", "empire"], 8.5),
    ("The Lies of Locke Lamora", "Scott Lynch", ["Fantasy", "Heist"], ["voleurs", "arnaque", "amitie", "venise"], 8.3),
    ("The Blade Itself", "Joe Abercrombie", ["Fantasy", "Grimdark"], ["guerre", "violence", "antiheros", "pouvoir"], 8.1),
    ("The Poppy War", "R. F. Kuang", ["Fantasy", "Historique"], ["guerre", "empire", "magie", "vengeance"], 8.0),
    ("Babel", "R. F. Kuang", ["Fantasy", "Academia"], ["traduction", "colonialisme", "langage", "oxford"], 8.2),
    ("Yellowface", "R. F. Kuang", ["Satire", "Contemporain"], ["edition", "appropriation", "mensonge", "ambition"], 7.8),
    ("The Three-Body Problem", "Liu Cixin", ["Science-fiction", "Hard SF"], ["contact", "chine", "physique", "civilisation"], 8.1),
    ("Children of Time", "Adrian Tchaikovsky", ["Science-fiction", "Evolution"], ["araignees", "terraforming", "humanite", "temps"], 8.4),
    ("Leviathan Wakes", "James S. A. Corey", ["Science-fiction", "Space opera"], ["espace", "politique", "enquete", "alien"], 8.3),
    ("Hyperion", "Dan Simmons", ["Science-fiction", "Space opera"], ["pelerinage", "temps", "recits", "mystere"], 8.5),
    ("Snow Crash", "Neal Stephenson", ["Science-fiction", "Cyberpunk"], ["metavers", "langage", "satire", "virus"], 8.0),
    ("The Girl with the Dragon Tattoo", "Stieg Larsson", ["Polar", "Thriller"], ["enquete", "famille", "journalisme", "vengeance"], 8.1),
    ("Gone Girl", "Gillian Flynn", ["Thriller", "Psychologique"], ["couple", "mensonge", "media", "manipulation"], 8.0),
    ("The Silent Patient", "Alex Michaelides", ["Thriller", "Psychologique"], ["silence", "therapie", "meurtre", "obsession"], 7.7),
    ("The Thursday Murder Club", "Richard Osman", ["Polar", "Humour"], ["retraite", "enquete", "amitie", "club"], 7.9),
    ("The Name of the Rose", "Umberto Eco", ["Historique", "Mystere"], ["monastere", "livres", "meurtres", "theologie"], 8.3),
    ("The Da Vinci Code", "Dan Brown", ["Thriller", "Mystere"], ["symbole", "secret", "art", "poursuite"], 7.5),
    ("In Cold Blood", "Truman Capote", ["Non-fiction", "True crime"], ["meurtre", "journalisme", "amerique", "justice"], 8.2),
    ("The Devil in the White City", "Erik Larson", ["Non-fiction", "Histoire"], ["chicago", "exposition", "crime", "architecture"], 8.0),
    ("Bad Blood", "John Carreyrou", ["Non-fiction", "Business"], ["theranos", "mensonge", "startup", "enquete"], 8.4),
    ("Thinking, Fast and Slow", "Daniel Kahneman", ["Essai", "Psychologie"], ["biais", "decision", "cerveau", "jugement"], 8.2),
    ("Atomic Habits", "James Clear", ["Developpement", "Psychologie"], ["habitudes", "systemes", "progres", "identite"], 8.3),
    ("The Power of Habit", "Charles Duhigg", ["Developpement", "Psychologie"], ["habitude", "routine", "changement", "organisation"], 7.9),
    ("Deep Work", "Cal Newport", ["Developpement", "Travail"], ["concentration", "attention", "productivite", "metier"], 8.1),
    ("The Lean Startup", "Eric Ries", ["Business", "Innovation"], ["startup", "produit", "iteration", "apprentissage"], 7.8),
    ("Zero to One", "Peter Thiel", ["Business", "Innovation"], ["startup", "monopole", "strategie", "technologie"], 7.7),
    ("The Design of Everyday Things", "Don Norman", ["Design", "Essai"], ["interface", "objet", "usage", "ergonomie"], 8.2),
    ("Invisible Women", "Caroline Criado Perez", ["Essai", "Societe"], ["donnees", "genre", "politique", "invisibilite"], 8.4),
    ("The Immortal Life of Henrietta Lacks", "Rebecca Skloot", ["Non-fiction", "Science"], ["cellules", "ethique", "famille", "medecine"], 8.2),
    ("Braiding Sweetgrass", "Robin Wall Kimmerer", ["Essai", "Nature"], ["plantes", "ecologie", "savoirs", "reciprocite"], 8.7),
]

KNOWN_RELEASE_YEARS = {
    "1984": "1949",
    "Kafka on the Shore": "2002",
    "Love in the Time of Cholera": "1985",
    "A Man Called Ove": "2012",
    "The Design of Everyday Things": "1988",
}

FALLBACK_SUMMARIES = {
    "Dune": "Paul Atreides quitte le confort relatif de Caladan pour Arrakis, planète désertique au cœur de toutes les convoitises. Son histoire mêle initiation politique, survie dans un environnement hostile, guerre des maisons, mystique fremen et réflexion sur le danger des héros providentiels. Le roman avance comme une fresque où écologie, religion et pouvoir ne cessent de s'entremêler.",
    "1984": "Winston Smith vit dans un régime où chaque geste, chaque mot et chaque souvenir peuvent devenir suspects. En essayant de préserver une pensée intime, puis un amour clandestin, il affronte une machine politique qui veut contrôler non seulement les corps, mais la réalité elle-même. Le livre reste une méditation glaçante sur la surveillance, la langue et la fabrication de la vérité.",
    "Harry Potter and the Philosopher's Stone": "Harry Potter découvre à onze ans qu'il appartient à un monde magique dont il ignorait tout, et que son nom y porte déjà une légende. Entre l'arrivée à Poudlard, les premières amitiés, les rivalités et les secrets enfouis dans l'école, le roman installe un récit d'initiation très accessible. La force du livre vient autant de son imaginaire chaleureux que de la menace qui se dessine derrière l'émerveillement.",
    "Piranesi": "Piranesi vit dans une Maison immense, faite de salles, de statues, de marées et de silences. Il en connaît les rythmes avec une confiance presque sacrée, jusqu'à ce que des indices fissurent peu à peu sa compréhension du monde. Le roman joue sur la mémoire, la solitude et la beauté étrange des lieux pour construire un mystère intime, poétique et très singulier.",
    "Foundation": "Hari Seldon a prévu l'effondrement d'un empire galactique grâce à la psychohistoire, une science capable de lire les grands mouvements des sociétés. Pour réduire les siècles de chaos à venir, il organise une Fondation chargée de préserver le savoir humain. Le roman suit cette idée sur plusieurs générations, entre crises politiques, stratégie, foi dans la science et fragilité des civilisations.",
    "The Hobbit": "Bilbo Baggins mène une vie tranquille jusqu'à l'arrivée de Gandalf et d'une compagnie de nains décidés à reprendre leur royaume au dragon Smaug. Le voyage l'arrache à son confort et révèle chez lui une forme de courage plus fine que l'héroïsme bruyant. Conte d'aventure, de ruse et d'amitié, le livre pose les premières pierres de la Terre du Milieu avec une grande clarté romanesque.",
    "Pride and Prejudice": "Elizabeth Bennet observe avec ironie une société où le mariage, l'argent et la réputation décident souvent du destin des femmes. Sa relation avec Mr Darcy avance par malentendus, orgueil blessé et jugements trop rapides. Le roman reste vif parce qu'il combine comédie sociale, regard acéré sur les classes et véritable intelligence émotionnelle.",
    "The Handmaid's Tale": "Defred vit dans une théocratie qui a réduit les femmes fertiles à une fonction reproductive. À travers sa voix, le roman montre comment un régime peut coloniser les corps, la langue et les souvenirs personnels. La tension vient de cette résistance fragile, presque intérieure, face à un pouvoir qui veut rendre l'oppression normale.",
    "The Name of the Wind": "Kvothe raconte sa propre légende depuis l'enfance marquée par la perte jusqu'aux années d'apprentissage où se mêlent magie, musique, orgueil et survie. Le roman avance comme une confession autant que comme une aventure, avec un héros brillant mais vulnérable. Sa richesse tient à la sensation d'un monde vaste, aux détails de l'université et au mystère qui entoure la vérité derrière le mythe.",
}


def as_tmdb_json(items: list[str]) -> str:
    return str([{"id": index + 1, "name": item} for index, item in enumerate(items)])


def clean_text(value: Any) -> str:
    if isinstance(value, dict):
        value = value.get("value", "")
    if not isinstance(value, str):
        return ""
    text = re.sub(r"\[([^\]]+)\]\[\d+\]", r"\1", value)
    text = re.sub(r"\n\s*\[\d+\]:\s*\S+", "", text)
    text = re.sub(r"[*_`#>]+", "", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_open_library_doc(title: str, author: str) -> dict[str, Any]:
    try:
        response = requests.get(
            "https://openlibrary.org/search.json",
            params={
                "title": title,
                "author": author,
                "limit": 1,
                "fields": "key,title,author_name,first_publish_year,cover_i,ratings_average,ratings_count,number_of_pages_median,subject,isbn",
            },
            timeout=8,
        )
        docs = response.json().get("docs", [])
        return docs[0] if docs else {}
    except Exception:
        return {}


def fetch_open_library_description(work_key: str) -> str:
    if not work_key:
        return ""
    try:
        response = requests.get(f"https://openlibrary.org{work_key}.json", timeout=8)
        return clean_text(response.json().get("description"))
    except Exception:
        return ""


def fallback_overview(title: str, author: str, genres: list[str], keywords: list[str]) -> str:
    if title in FALLBACK_SUMMARIES:
        return FALLBACK_SUMMARIES[title]
    genre_text = " et ".join(genres[:2]).lower() if genres else "littéraire"
    keyword_text = ", ".join(keywords[:4])
    central_theme = keywords[0] if keywords else "ses personnages"
    return (
        f"{title} de {author} est une lecture {genre_text} portée par {central_theme}. "
        f"Le livre explore {keyword_text} en laissant une vraie place au rythme, aux tensions intimes et aux choix des personnages. "
        "C'est une proposition solide pour enrichir un profil de lecture, surtout si tu cherches une recommandation avec une identité claire plutôt qu'un simple titre populaire."
    )


def build_overview(title: str, author: str, genres: list[str], keywords: list[str], description: str) -> str:
    fallback = fallback_overview(title, author, genres, keywords)
    if title in FALLBACK_SUMMARIES:
        return fallback
    if not description:
        return fallback
    if len(description) < 180:
        return f"{description} {fallback}"
    if len(description) > 1200:
        trimmed = description[:1200].rsplit(" ", 1)[0].rstrip(".,;:")
        return f"{trimmed}."
    return description


def build_row(index: int, seed: tuple[str, str, list[str], list[str], float]) -> dict[str, Any]:
    title, author, genres, keywords, rating = seed
    doc = fetch_open_library_doc(title, author)
    work_key = str(doc.get("key") or "")
    description = fetch_open_library_description(work_key)
    overview = build_overview(title, author, genres, keywords, description)
    cover_id = doc.get("cover_i")
    isbn_values = doc.get("isbn") if isinstance(doc.get("isbn"), list) else []
    isbn = str(isbn_values[0]) if isbn_values else ""
    year = KNOWN_RELEASE_YEARS.get(title, str(doc.get("first_publish_year") or ""))
    pages = int(doc.get("number_of_pages_median") or 0)
    open_rating = float(doc.get("ratings_average") or 0)
    if 0 < open_rating <= 5:
        open_rating *= 2
    vote_average = round(open_rating if open_rating > 0 else rating, 1)
    vote_count = int(doc.get("ratings_count") or 300 + index * 17)
    subjects = [str(item) for item in (doc.get("subject") or [])[:8] if str(item)]
    merged_keywords = list(dict.fromkeys([*keywords, *subjects[:4]]))
    book_id = 100000 + index
    cover_url = (
        f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"
        if cover_id
        else (f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg" if isbn else "https://via.placeholder.com/500x750?text=Book")
    )
    soup = " ".join([title, author, " ".join(genres), " ".join(merged_keywords), overview]).lower()
    return {
        "id": book_id,
        "title": title,
        "author": author,
        "isbn": isbn,
        "open_library_key": work_key,
        "release_date": year,
        "runtime": pages,
        "vote_average": vote_average,
        "vote_count": vote_count,
        "popularity": max(vote_count, 1) + (vote_average * 10),
        "genres": as_tmdb_json(genres),
        "keywords": as_tmdb_json(merged_keywords[:12]),
        "overview": overview,
        "tagline": f"Une piste {genres[0].lower()} pour ta prochaine lecture.",
        "poster_url": cover_url,
        "cover_url": cover_url,
        "soup": soup,
    }


rows = [build_row(index, seed) for index, seed in enumerate(BOOK_SEEDS, start=1)]

with open("books.pkl", "wb") as output:
    pickle.dump(pd.DataFrame(rows), output)

print(f"Generated books.pkl with {len(rows)} books")
