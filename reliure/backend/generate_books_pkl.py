import ast
import pickle

import pandas as pd


BOOKS = [
    {
        "id": 100001,
        "title": "Dune",
        "author": "Frank Herbert",
        "isbn": "9780441172719",
        "year": "1965",
        "rating": 8.9,
        "genres": ["Science-fiction", "Aventure"],
        "keywords": ["politique", "ecologie", "desert", "empire", "prophetie"],
        "overview": "Paul Atreides arrive sur Arrakis, une planete desertique ou pouvoir, ecologie et propheties se disputent l'avenir.",
        "pages": 688,
    },
    {
        "id": 100002,
        "title": "Piranesi",
        "author": "Susanna Clarke",
        "isbn": "9781526622433",
        "year": "2020",
        "rating": 8.6,
        "genres": ["Fantastique", "Mystere"],
        "keywords": ["maison", "memoire", "labyrinthe", "solitude", "statues"],
        "overview": "Piranesi vit dans une Maison infinie de salles et de statues, jusqu'a ce que des traces d'un autre monde fissurent son quotidien.",
        "pages": 272,
    },
    {
        "id": 100003,
        "title": "Circe",
        "author": "Madeline Miller",
        "isbn": "9780316556347",
        "year": "2018",
        "rating": 8.4,
        "genres": ["Fantasy", "Mythologie"],
        "keywords": ["magie", "exil", "dieux", "emancipation", "ile"],
        "overview": "Une nymphe rejetee par les dieux apprend la magie, l'exil et la liberte sur son ile.",
        "pages": 400,
    },
    {
        "id": 100004,
        "title": "Le Nom du vent",
        "author": "Patrick Rothfuss",
        "isbn": "9780756404741",
        "year": "2007",
        "rating": 8.8,
        "genres": ["Fantasy", "Aventure"],
        "keywords": ["magie", "musique", "universite", "legende", "apprentissage"],
        "overview": "Kvothe raconte comment il est devenu musicien, etudiant, magicien et legende.",
        "pages": 672,
    },
    {
        "id": 100005,
        "title": "L'Etranger",
        "author": "Albert Camus",
        "isbn": "9782070360024",
        "year": "1942",
        "rating": 8.1,
        "genres": ["Classique", "Litteraire"],
        "keywords": ["absurde", "justice", "proces", "detachement", "soleil"],
        "overview": "Meursault traverse un deuil, un crime et un proces avec une distance qui derange tout le monde.",
        "pages": 184,
    },
    {
        "id": 100006,
        "title": "Orgueil et Prejuges",
        "author": "Jane Austen",
        "isbn": "9780141439518",
        "year": "1813",
        "rating": 8.7,
        "genres": ["Classique", "Romance"],
        "keywords": ["societe", "famille", "ironie", "mariage", "dialogue"],
        "overview": "Elizabeth Bennet jauge Darcy, sa famille et les regles sociales avec ironie et lucidite.",
        "pages": 432,
    },
    {
        "id": 100007,
        "title": "1984",
        "author": "George Orwell",
        "isbn": "9780451524935",
        "year": "1949",
        "rating": 8.9,
        "genres": ["Dystopie", "Politique"],
        "keywords": ["surveillance", "langage", "pouvoir", "memoire", "resistance"],
        "overview": "Winston Smith tente de preserver une pensee libre sous le regard permanent de Big Brother.",
        "pages": 328,
    },
    {
        "id": 100008,
        "title": "La Servante ecarlate",
        "author": "Margaret Atwood",
        "isbn": "9780385490818",
        "year": "1985",
        "rating": 8.3,
        "genres": ["Dystopie", "Feminisme"],
        "keywords": ["theocratie", "corps", "memoire", "resistance", "controle"],
        "overview": "Defred survit dans une theocratie qui controle les corps, les mots et les souvenirs.",
        "pages": 336,
    },
    {
        "id": 100009,
        "title": "Kafka sur le rivage",
        "author": "Haruki Murakami",
        "isbn": "9781400079278",
        "year": "2002",
        "rating": 8.2,
        "genres": ["Litteraire", "Fantastique"],
        "keywords": ["reve", "identite", "fugue", "japon", "etrange"],
        "overview": "Un adolescent fuit sa maison tandis qu'un vieil homme suit une piste mysterieuse, dans un Japon ou le reel se fissure.",
        "pages": 505,
    },
    {
        "id": 100010,
        "title": "Normal People",
        "author": "Sally Rooney",
        "isbn": "9781984822178",
        "year": "2018",
        "rating": 7.9,
        "genres": ["Contemporain", "Romance"],
        "keywords": ["amour", "classe", "jeunesse", "intimite", "universite"],
        "overview": "Connell et Marianne se retrouvent, se ratent et grandissent ensemble entre lycee, universite et blessures sociales.",
        "pages": 273,
    },
    {
        "id": 100011,
        "title": "Un gentleman a Moscou",
        "author": "Amor Towles",
        "isbn": "9780143110439",
        "year": "2016",
        "rating": 8.5,
        "genres": ["Historique", "Litteraire"],
        "keywords": ["hotel", "russie", "elegance", "amitie", "huis clos"],
        "overview": "Assigne a residence dans un grand hotel, le comte Rostov transforme sa captivite en art de vivre.",
        "pages": 496,
    },
    {
        "id": 100012,
        "title": "Persepolis",
        "author": "Marjane Satrapi",
        "isbn": "9780375714573",
        "year": "2000",
        "rating": 8.6,
        "genres": ["Graphique", "Memoire"],
        "keywords": ["iran", "exil", "famille", "politique", "revolution"],
        "overview": "Marjane Satrapi raconte son enfance en Iran, la revolution, l'exil et la construction d'une voix libre.",
        "pages": 352,
    },
    {
        "id": 100013,
        "title": "Educated",
        "author": "Tara Westover",
        "isbn": "9780399590504",
        "year": "2018",
        "rating": 8.4,
        "genres": ["Memoire", "Non-fiction"],
        "keywords": ["education", "famille", "rupture", "liberte", "universite"],
        "overview": "Tara Westover grandit loin de l'ecole puis conquiert son autonomie intellectuelle jusqu'a Cambridge.",
        "pages": 352,
    },
    {
        "id": 100014,
        "title": "Sapiens",
        "author": "Yuval Noah Harari",
        "isbn": "9780062316097",
        "year": "2011",
        "rating": 8.2,
        "genres": ["Essai", "Histoire"],
        "keywords": ["humanite", "mythes", "societe", "science", "civilisation"],
        "overview": "Une lecture transversale de l'evolution, des mythes collectifs, de l'agriculture, de l'argent et de la modernite.",
        "pages": 464,
    },
]


def as_tmdb_json(items: list[str]) -> str:
    return str([{"id": index + 1, "name": item} for index, item in enumerate(items)])


rows = []
for book in BOOKS:
    cover_url = f"https://covers.openlibrary.org/b/isbn/{book['isbn']}-L.jpg"
    soup = " ".join(
        [
            book["title"],
            book["author"],
            " ".join(book["genres"]),
            " ".join(book["keywords"]),
            book["overview"],
        ]
    ).lower()
    rows.append(
        {
            "id": book["id"],
            "title": book["title"],
            "author": book["author"],
            "isbn": book["isbn"],
            "release_date": book["year"],
            "runtime": book["pages"],
            "vote_average": book["rating"],
            "vote_count": 1000 + (book["id"] % 1000),
            "popularity": 100 + (book["rating"] * 10),
            "genres": as_tmdb_json(book["genres"]),
            "keywords": as_tmdb_json(book["keywords"]),
            "overview": book["overview"],
            "tagline": f"Une piste {book['genres'][0].lower()} pour ta prochaine lecture.",
            "poster_url": cover_url,
            "cover_url": cover_url,
            "soup": soup,
        }
    )

with open("books.pkl", "wb") as output:
    pickle.dump(pd.DataFrame(rows), output)

print(f"Generated books.pkl with {len(rows)} books")
