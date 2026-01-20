import pandas as pd

df = pd.read_csv('tmdb_5000_movies.csv')

df.to_pickle('movies.pkl')