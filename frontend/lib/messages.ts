export interface SharedMovie {
  id: number;
  title: string;
  poster_url: string;
  rating: number | null;
}

export interface DirectMessage {
  id: number;
  content: string;
  created_at: string;
  is_mine: boolean;
  sender: {
    id: number;
    username: string;
  };
  movie: SharedMovie | null;
}

export interface DirectConversationSummary {
  id: number;
  created_at: string;
  updated_at: string;
  participant: {
    id: number;
    username: string;
  };
  last_message: {
    id: number;
    content: string;
    created_at: string;
    sender_id: number;
    preview: string;
    movie: {
      id: number;
      title: string;
      poster_url: string;
    } | null;
  } | null;
  unread_count: number;
}

export interface DirectConversationDetail {
  conversation: {
    id: number;
    participant: {
      id: number;
      username: string;
    };
  };
  messages: DirectMessage[];
}
