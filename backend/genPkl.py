import pandas as pd
import ast

df = pd.read_csv('tmdb_5000_movies.csv')

def extract_names(json_str):
    """Extract 'name' values from JSON string like [{"id": 1, "name": "Action"}, ...]"""
    try:
        items = ast.literal_eval(json_str)
        return ' '.join([item['name'].replace(' ', '') for item in items])
    except:
        return ''

# Create 'soup' column by combining genres, keywords, and overview
df['genres_text'] = df['genres'].apply(extract_names)
df['keywords_text'] = df['keywords'].apply(extract_names)
df['overview_clean'] = df['overview'].fillna('').astype(str)

df['soup'] = df['genres_text'] + ' ' + df['keywords_text'] + ' ' + df['overview_clean']
df['soup'] = df['soup'].str.lower()

# Drop temporary columns
df = df.drop(columns=['genres_text', 'keywords_text', 'overview_clean'])

df.to_pickle('movies.pkl')
print("movies.pkl generated with 'soup' column!")