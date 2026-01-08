"use client";

import { useEffect, useState } from "react";
import { Calendar, Star } from "lucide-react";

interface MovieNews {
  id: number;
  title: string;
  poster_url: string;
  rating: number;
  overview: string;
}

export default function NewsPage() {
  const [news, setNews] = useState<MovieNews[]>([]);

  useEffect(() => {
    fetch("http://127.0.0.1:8000/movies/news")
      .then((res) => res.json())
      .then((data) => setNews(data));
  }, []);

  return (
    <main className="min-h-screen bg-black text-white p-4 pb-24">
      <h1 className="text-3xl font-bold text-red-600 mb-6 flex items-center gap-2">
        <Calendar className="w-8 h-8" /> À l'affiche
      </h1>

      <div className="space-y-6">
        {news.map((movie) => (
          <div key={movie.id} className="flex gap-4 bg-gray-900 p-3 rounded-xl border border-gray-800 shadow-lg">
            {/* Image (Petite à gauche) */}
            <img 
              src={movie.poster_url} 
              alt={movie.title} 
              className="w-24 h-36 object-cover rounded-lg flex-shrink-0"
            />
            
            {/* Texte */}
            <div className="flex flex-col">
              <h2 className="text-lg font-bold leading-tight">{movie.title}</h2>
              <div className="flex items-center text-yellow-400 text-sm mt-1 mb-2">
                <Star className="w-4 h-4 mr-1 fill-current" />
                {movie.rating.toFixed(1)}/10
              </div>
              <p className="text-gray-400 text-sm line-clamp-4 leading-relaxed">
                {movie.overview || "Pas de résumé disponible."}
              </p>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}