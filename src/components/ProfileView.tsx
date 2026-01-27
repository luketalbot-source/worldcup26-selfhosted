import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Target, CheckCircle, XCircle, TrendingUp, LogOut, Edit2, LogIn, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { usePredictions } from '@/hooks/usePredictions';
import { useUserStats } from '@/hooks/useUserStats';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const AVATAR_OPTIONS = ['👤', '⚽', '🏆', '🎯', '🌟', '🔥', '💪', '🦁', '🐯', '🦅'];

export const ProfileView = () => {
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile(user?.id);
  const { predictions } = usePredictions();
  const { stats } = useUserStats(user?.id);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');

  const handleEdit = () => {
    setEditName(profile?.displayName || '');
    setEditAvatar(profile?.avatarEmoji || '👤');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      toast({ title: 'Error', description: 'Display name cannot be empty', variant: 'destructive' });
      return;
    }
    
    const { error } = await updateProfile(editName, editAvatar) || {};
    if (error) {
      toast({ title: 'Error', description: 'Failed to update profile', variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: 'Profile updated!' });
      setIsEditing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    toast({ title: 'Signed out', description: 'See you next time!' });
    navigate('/');
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3">
              <User className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Guest</h2>
            <p className="text-white/70 text-sm mt-1">Enter a username to save your predictions</p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              Pick a username to save your predictions and compete on the leaderboard!
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
            >
              <LogIn className="w-5 h-5" />
              Enter Username
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-navy px-4 py-8 text-center relative">
          {!isEditing && (
            <button
              onClick={handleEdit}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Edit2 className="w-4 h-4 text-white" />
            </button>
          )}
          
          {isEditing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap justify-center gap-2">
                {AVATAR_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setEditAvatar(emoji)}
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all ${
                      editAvatar === emoji 
                        ? 'bg-white/30 ring-2 ring-white' 
                        : 'bg-white/10 hover:bg-white/20'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Display name"
                className="max-w-xs mx-auto text-center"
              />
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 text-4xl">
                {profile?.avatarEmoji || '👤'}
              </div>
              <h2 className="text-xl font-bold text-white">{profile?.displayName || 'Predictor'}</h2>
            </>
          )}
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-xl p-4 text-center">
              <Target className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{predictions.length}</div>
              <div className="text-xs text-muted-foreground">Predictions</div>
            </div>
            <div className="bg-muted rounded-xl p-4 text-center">
              <TrendingUp className="w-6 h-6 text-fifa-green mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.totalPoints}</div>
              <div className="text-xs text-muted-foreground">Points</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 p-4"
      >
        <h3 className="font-semibold text-foreground mb-4">Your Stats</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-fifa-gold" />
              <span className="text-sm text-foreground">Exact Scores</span>
            </div>
            <span className="font-semibold text-foreground">{stats.exactScores}</span>
          </div>
          
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-fifa-green" />
              <span className="text-sm text-foreground">Correct Results</span>
            </div>
            <span className="font-semibold text-foreground">{stats.correctResults}</span>
          </div>
          
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm text-foreground">Wrong Results</span>
            </div>
            <span className="font-semibold text-foreground">{stats.wrongResults}</span>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-primary" />
              <span className="text-sm text-foreground">Accuracy</span>
            </div>
            <span className="font-semibold text-foreground">
              {stats.exactScores + stats.correctResults + stats.wrongResults > 0 
                ? `${stats.accuracy}%` 
                : '--'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Sign Out */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        Sign Out
      </motion.button>
    </div>
  );
};
