import pandas as pd

print("\n🕵️‍♂️ ANALYSE DU FICHIER tmdb_5000_movies.csv")
print("="*50)

try:
    # On lit seulement les 3 premières lignes pour voir la structure
    df = pd.read_csv('tmdb_5000_movies.csv', nrows=3)
    
    print(f"✅ Fichier ouvert avec succès.")
    print(f"📊 Nombre de colonnes détectées : {len(df.columns)}")
    print("\n📜 LISTE EXACTE DES COLONNES :")
    print(df.columns.tolist())
    
    print("\n👀 APERÇU DE LA PREMIÈRE LIGNE :")
    # On affiche la première ligne pour voir si les données sont bien alignées
    print(df.iloc[0])

except Exception as e:
    print(f"❌ IMPOSSIBLE DE LIRE LE FICHIER : {e}")

print("="*50)