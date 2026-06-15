import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

let _supabase = null;
function supabase() {
  if (!_supabase) {
    _supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  }
  return _supabase;
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export async function submitScore({ name, score, maxScore }) {
  const { error } = await supabase().from('scores').insert({
    date: todayStr(),
    name: name.trim().slice(0, 24),
    score,
    max_score: maxScore,
  });
  if (error) throw error;
}

export async function fetchLeaderboard() {
  const { data, error } = await supabase()
    .from('scores')
    .select('name, score, max_score')
    .eq('date', todayStr())
    .order('score', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}
