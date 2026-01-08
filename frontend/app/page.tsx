"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { X, Clock, Loader2, Star, ListPlus, Check } from "lucide-react";

interface Movie { id: number; title: string; poster_url: string; rating: number; }
interface Playlist { id: number; name: string; type: string; }

export default function Home() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [exitDirection, setExitDirection] = useState<number>(0);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [initialized, setInitialized] = useState(false);
  
  // États pour le choix de playlist
  const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    if (!initialized) {
        fetchMovies();
        setInitialized(true);
    }
  }, []);

  const fetchMovies = () => {
    fetch("http://127.0.0.1:8000/movies/feed?limit=10").then(r=>r.json()).then(d=>{
        setMovies(p => [...p, ...d.filter((m:Movie) => !p.some(pm=>pm.id===m.id))]);
        setLoading(false);
    });
  };

  const fetchPlaylists = async () => {
      const res = await fetch("http://127.0.0.1:8000/playlists");
      const data = await res.json();
      // On garde uniquement les listes où on peut ajouter des trucs (pas les listes auto)
      setMyPlaylists(data.filter((p: Playlist) => p.type !== "system"));
  };

  const handleSwipe = (direction: "left" | "right", movie: Movie) => {
    if (direction === "right") {
      // AJOUTE À LA PLAYLIST PAR DÉFAUT (ID 1 = À regarder plus tard)
      fetch(`http://127.0.0.1:8000/playlists/1/add/${movie.id}`, { method: "POST" });
    } else {
      // NOTE 1/5 (Dislike / Vu)
      fetch(`http://127.0.0.1:8000/movies/rate/${movie.id}/1`, { method: "POST" });
    }
    removeCard();
  };

  const handleRate = (rating: number, movie: Movie) => {
    fetch(`http://127.0.0.1:8000/movies/rate/${movie.id}/${rating}`, { method: "POST" });
    setExitDirection(rating >= 3 ? 1000 : -1000);
    setTimeout(() => removeCard(), 50);
  };

  const removeCard = () => {
    setMovies(p => p.slice(1));
    if (movies.length < 5) fetchMovies();
    setTimeout(() => setExitDirection(0), 200);
  };

  const manualSwipe = (direction: "left" | "right") => {
    setExitDirection(direction === "left" ? -1000 : 1000);
    setTimeout(() => handleSwipe(direction, movies[0]), 50);
  };

  const openDetails = async (id: number) => {
    if (exitDirection !== 0) return;
    const res = await fetch(`http://127.0.0.1:8000/movie/${id}`);
    const data = await res.json();
    setSelectedMovie(data);
  };

  const openPlaylistSelector = () => {
      fetchPlaylists();
      setShowPlaylistSelector(true);
  };

  const addToSpecificPlaylist = (playlistId: number) => {
      if(selectedMovie) {
          fetch(`http://127.0.0.1:8000/playlists/${playlistId}/add/${selectedMovie.id}`, { method: "POST" });
          setShowPlaylistSelector(false);
          setSelectedMovie(null);
          manualSwipe("right"); // Animation de sortie positive
      }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center pt-8 overflow-hidden relative">
      <h1 className="text-2xl font-bold text-red-600 tracking-tighter mb-4">WeChoose 🍿</h1>

      <div className="relative w-full max-w-sm h-[60vh] flex items-center justify-center">
        {loading && movies.length === 0 ? (
           <div className="text-gray-500 flex flex-col items-center gap-2"><Loader2 className="animate-spin text-red-600"/> <p>Chargement...</p></div>
        ) : (
          <AnimatePresence>
            {movies.map((m, i) => i <= 1 && (
                <Card key={m.id} movie={m} isFront={i===0} onSwipe={handleSwipe} onRate={handleRate} exitDirection={exitDirection} onInfoClick={() => openDetails(m.id)} />
            )).reverse()} 
          </AnimatePresence>
        )}
      </div>

      {!selectedMovie && movies.length > 0 && (
        <div className="flex gap-8 mt-8 z-20">
            <button onClick={()=>manualSwipe("left")} className="p-4 rounded-full border border-gray-800 bg-gray-900 text-red-500 hover:scale-110 transition"><X size={32}/></button>
            <button onClick={()=>manualSwipe("right")} className="p-4 rounded-full border border-gray-800 bg-gray-900 text-blue-500 hover:scale-110 transition"><Clock size={32}/></button>
        </div>
      )}

      {/* MODAL DETAIL */}
      {selectedMovie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in">
          <div className="bg-gray-900 w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-gray-800 relative">
            {!showPlaylistSelector ? (
                <>
                    <button onClick={()=>setSelectedMovie(null)} className="absolute top-3 right-3 z-10 bg-black/60 p-1.5 rounded-full"><X className="w-5 h-5"/></button>
                    <div className="aspect-video bg-black">
                        {selectedMovie.trailer_url ? <iframe src={selectedMovie.trailer_url} className="w-full h-full" allowFullScreen/> : <img src={selectedMovie.poster_url} className="w-full h-full object-cover opacity-60"/>}
                    </div>
                    <div className="p-5">
                        <h2 className="text-xl font-bold mb-1">{selectedMovie.title}</h2>
                        <div className="flex gap-2 text-xs text-gray-400 mb-4"><span>{selectedMovie.release_date}</span><span className="text-yellow-400 flex items-center"><Star className="w-3 h-3 mr-1 fill-current"/>{selectedMovie.rating}</span></div>
                        
                        <button onClick={openPlaylistSelector} className="w-full bg-blue-600 py-3 rounded-xl font-bold flex justify-center gap-2 mb-6 hover:bg-blue-500"><ListPlus/> Ajouter à une playlist</button>
                        
                        <p className="text-gray-300 text-sm mb-4">{selectedMovie.overview}</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                            {selectedMovie.cast?.map((a:any, i:number)=>(<div key={i} className="w-16 flex-shrink-0 text-center"><img src={a.photo||""} className="w-12 h-12 rounded-full object-cover mx-auto mb-1 bg-gray-800"/><p className="text-[10px] truncate">{a.name}</p></div>))}
                        </div>
                    </div>
                </>
            ) : (
                // SELECTEUR DE PLAYLIST
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                        <button onClick={()=>setShowPlaylistSelector(false)}><X/></button>
                        <h3 className="font-bold text-lg">Choisir une playlist</h3>
                    </div>
                    <div className="space-y-2">
                        {myPlaylists.map(p => (
                            <button key={p.id} onClick={()=>addToSpecificPlaylist(p.id)} className="w-full p-4 bg-gray-800 rounded-xl flex justify-between hover:bg-gray-700">
                                <span>{p.name}</span>
                                {p.id===1 && <Clock className="w-4 h-4 text-blue-400"/>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Card({ movie, isFront, onSwipe, onRate, exitDirection, onInfoClick }: any) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);
  const opacityBlue = useTransform(x, [0, 100], [0, 0.5]);
  const opacityRed = useTransform(x, [0, -100], [0, 0.5]);

  return (
    <motion.div style={{x, rotate, opacity, zIndex: isFront?1:0}} drag={isFront?"x":false} dragConstraints={{left:0, right:0}} onDragEnd={(e,i)=>{if(i.offset.x>100)onSwipe("right",movie);else if(i.offset.x<-100)onSwipe("left",movie)}} animate={{scale:1, opacity:1}} exit={{x:exitDirection!==0?exitDirection:(x.get()<0?-1000:1000), opacity:0}} className={`absolute top-0 w-[85%] md:w-[320px] h-full bg-gray-900 rounded-2xl shadow-xl border border-gray-800 overflow-hidden ${!isFront&&"pointer-events-none"}`}>
      <div className="relative h-full flex flex-col">
          <div className="h-[75%] relative" onClick={()=>isFront&&onInfoClick()}>
            <img src={movie.poster_url} className="w-full h-full object-cover pointer-events-none"/>
            <div className="absolute bottom-0 w-full h-24 bg-gradient-to-t from-gray-900 to-transparent pointer-events-none"/>
          </div>
          <div className="h-[25%] px-4 flex flex-col justify-center bg-gray-900 z-10">
            <div onClick={()=>isFront&&onInfoClick()}>
                <h2 className="text-lg font-bold truncate text-white">{movie.title}</h2>
                <div className="flex items-center text-yellow-400 text-xs mb-2"><Star className="w-3 h-3 mr-1 fill-current"/>{movie.rating}/10</div>
            </div>
            <div className="mt-1 pt-2 border-t border-gray-800">
                <p className="text-[10px] text-gray-500 mb-1">Déjà vu ? Notez-le :</p>
                <div className="flex justify-between max-w-[200px]">{[1,2,3,4,5].map(s=>(<button key={s} onClick={(e)=>{e.stopPropagation();isFront&&onRate(s,movie)}} className="text-gray-600 hover:text-yellow-400 hover:scale-125 transition p-1"><Star className="w-5 h-5 fill-current"/></button>))}</div>
            </div>
          </div>
      </div>
      {isFront && <><motion.div style={{opacity:opacityBlue}} className="absolute inset-0 bg-blue-500 mix-blend-overlay pointer-events-none"/><motion.div style={{opacity:opacityRed}} className="absolute inset-0 bg-red-500 mix-blend-overlay pointer-events-none"/></>}
    </motion.div>
  );
}