import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Copy, Check, LogIn, ArrowLeft, Crown, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLeagues, League, LeagueMember } from '@/hooks/useLeagues';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const LEAGUE_EMOJIS = ['🏆', '⚽', '🥇', '🌟', '🔥', '💪', '🦁', '🐯', '🦅', '👑', '⚡', '🎯', '🏅', '🎮', '🌍'];

export const LeaguesView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { leagues, loading, createLeague, joinLeague, updateLeague, getLeagueMembers } = useLeagues();
  
  const [view, setView] = useState<'list' | 'create' | 'join' | 'detail' | 'edit'>('list');
  const [selectedLeague, setSelectedLeague] = useState<League | null>(null);
  const [leagueMembers, setLeagueMembers] = useState<LeagueMember[]>([]);
  
  // Create form state
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏆');
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Join form state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  
  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('🏆');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    const league = await createLeague(newName.trim(), newEmoji);
    if (league) {
      setCreatedLeague(league);
    }
  };

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t('leagues.codeCopied'));
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || joinCode.length !== 6) return;
    
    setJoining(true);
    const success = await joinLeague(joinCode.trim());
    setJoining(false);
    
    if (success) {
      setJoinCode('');
      setView('list');
    }
  };

  const handleViewLeague = async (league: League) => {
    setSelectedLeague(league);
    const members = await getLeagueMembers(league.id);
    setLeagueMembers(members);
    setView('detail');
  };

  const handleEditLeague = () => {
    if (!selectedLeague) return;
    setEditName(selectedLeague.name);
    setEditEmoji(selectedLeague.avatar_emoji || '🏆');
    setView('edit');
  };

  const handleSaveEdit = async () => {
    if (!selectedLeague || !editName.trim()) return;
    
    setSaving(true);
    const success = await updateLeague(selectedLeague.id, editName.trim(), editEmoji);
    setSaving(false);
    
    if (success) {
      setSelectedLeague({ ...selectedLeague, name: editName.trim(), avatar_emoji: editEmoji });
      setView('detail');
    }
  };

  const resetCreate = () => {
    setNewName('');
    setNewEmoji('🏆');
    setCreatedLeague(null);
    setView('list');
  };

  if (!user) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 text-4xl">
              🏆
            </div>
            <h2 className="text-xl font-bold text-white">{t('leagues.title')}</h2>
            <p className="text-white/70 text-sm mt-1">{t('leagues.subtitle')}</p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('leagues.loginPrompt')}
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
            >
              <LogIn className="w-5 h-5" />
              {t('profile.enterUsername')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // League Detail View
  if (view === 'detail' && selectedLeague) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-6 relative">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-white/70 hover:text-white mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('leagues.backToList')}
            </button>
            
            {selectedLeague.creator_id === user.id && (
              <button
                onClick={handleEditLeague}
                className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
              >
                <Edit2 className="w-4 h-4 text-white" />
              </button>
            )}
            
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 text-3xl">
                {selectedLeague.avatar_emoji}
              </div>
              <h2 className="text-xl font-bold text-white">{selectedLeague.name}</h2>
              <p className="text-white/70 text-sm mt-1">
                {leagueMembers.length} {leagueMembers.length === 1 ? t('leagues.member') : t('leagues.members')}
              </p>
            </div>
          </div>
          
          <div className="p-4">
            <div className="flex items-center justify-between bg-muted rounded-xl p-3 mb-4">
              <div>
                <p className="text-xs text-muted-foreground">{t('leagues.joinCode')}</p>
                <p className="font-mono font-bold text-lg">{selectedLeague.join_code}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopyCode(selectedLeague.join_code)}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
            
            <h3 className="font-semibold mb-3">{t('leagues.membersList')}</h3>
            <div className="space-y-2">
              {leagueMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-3 p-3 bg-muted rounded-xl"
                >
                  <span className="text-2xl">{member.avatar_emoji || '👤'}</span>
                  <div className="flex-1">
                    <p className="font-medium">{member.display_name || t('leagues.unknownUser')}</p>
                  </div>
                  {member.user_id === selectedLeague.creator_id && (
                    <Crown className="w-4 h-4 text-fifa-gold" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Edit League View
  if (view === 'edit' && selectedLeague) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-6">
            <button
              onClick={() => setView('detail')}
              className="flex items-center gap-1 text-white/70 hover:text-white mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('leagues.backToDetail')}
            </button>
            <h2 className="text-xl font-bold text-white text-center">{t('leagues.editTitle')}</h2>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Emoji picker */}
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-4xl border-2 border-primary/20">
                {editEmoji}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{t('leagues.selectIcon')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {LEAGUE_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setEditEmoji(emoji)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                      editEmoji === emoji
                        ? 'bg-primary/20 ring-2 ring-primary scale-110'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Name input */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t('leagues.leagueName')}</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('leagues.leagueNamePlaceholder')}
                maxLength={30}
              />
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setView('detail')}
              >
                {t('profile.edit.cancel')}
              </Button>
              <Button
                className="flex-1"
                onClick={handleSaveEdit}
                disabled={!editName.trim() || saving}
              >
                {saving ? t('leagues.saving') : t('profile.edit.save')}
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Create League View
  if (view === 'create') {
    if (createdLeague) {
      return (
        <div className="space-y-4 max-w-[700px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
          >
            <div className="gradient-navy px-4 py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 text-4xl">
                {createdLeague.avatar_emoji}
              </div>
              <h2 className="text-xl font-bold text-white">{createdLeague.name}</h2>
              <p className="text-white/70 text-sm mt-1">{t('leagues.createdSuccess')}</p>
            </div>
            
            <div className="p-6">
              <p className="text-sm text-muted-foreground text-center mb-4">
                {t('leagues.shareCode')}
              </p>
              
              <div className="flex items-center justify-center gap-3 bg-muted rounded-xl p-4 mb-4">
                <span className="font-mono text-2xl font-bold tracking-widest">
                  {createdLeague.join_code}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleCopyCode(createdLeague.join_code)}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              
              <Button className="w-full" onClick={resetCreate}>
                {t('leagues.done')}
              </Button>
            </div>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-6">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-white/70 hover:text-white mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('leagues.backToList')}
            </button>
            <h2 className="text-xl font-bold text-white text-center">{t('leagues.createTitle')}</h2>
          </div>
          
          <div className="p-6 space-y-6">
            {/* Emoji picker */}
            <div className="text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-4xl border-2 border-primary/20">
                {newEmoji}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{t('leagues.selectIcon')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                {LEAGUE_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewEmoji(emoji)}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                      newEmoji === emoji
                        ? 'bg-primary/20 ring-2 ring-primary scale-110'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Name input */}
            <div>
              <label className="text-sm font-medium mb-2 block">{t('leagues.leagueName')}</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('leagues.leagueNamePlaceholder')}
                maxLength={30}
              />
            </div>
            
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={!newName.trim()}
            >
              {t('leagues.createButton')}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Join League View
  if (view === 'join') {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-6">
            <button
              onClick={() => setView('list')}
              className="flex items-center gap-1 text-white/70 hover:text-white mb-4 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('leagues.backToList')}
            </button>
            <h2 className="text-xl font-bold text-white text-center">{t('leagues.joinTitle')}</h2>
          </div>
          
          <div className="p-6 space-y-6">
            <div className="text-center">
              <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {t('leagues.enterCode')}
              </p>
            </div>
            
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="XXXXXX"
              className="text-center font-mono text-2xl tracking-widest h-14"
              maxLength={6}
            />
            
            <Button
              className="w-full"
              onClick={handleJoin}
              disabled={joinCode.length !== 6 || joining}
            >
              {joining ? t('leagues.joining') : t('leagues.joinButton')}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // List View (default)
  return (
    <div className="space-y-4 max-w-[700px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-navy px-4 py-6 text-center">
          <h2 className="text-xl font-bold text-white">{t('leagues.title')}</h2>
          <p className="text-white/70 text-sm mt-1">{t('leagues.subtitle')}</p>
        </div>
        
        <div className="p-4 flex gap-3">
          <Button
            className="flex-1"
            onClick={() => setView('create')}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('leagues.create')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setView('join')}
          >
            <Users className="w-4 h-4 mr-2" />
            {t('leagues.join')}
          </Button>
        </div>
      </motion.div>

      {/* Leagues List */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          {t('leagues.loading')}
        </div>
      ) : leagues.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 p-6 text-center"
        >
          <Users className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">{t('leagues.noLeagues')}</p>
        </motion.div>
      ) : (
        <AnimatePresence>
          {leagues.map((league, index) => (
            <motion.div
              key={league.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => handleViewLeague(league)}
              className="bg-card rounded-2xl shadow-card border border-border/50 p-4 cursor-pointer hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-2xl">
                  {league.avatar_emoji}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{league.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {league.member_count} {league.member_count === 1 ? t('leagues.member') : t('leagues.members')}
                  </p>
                </div>
                {league.creator_id === user.id && (
                  <Crown className="w-5 h-5 text-fifa-gold" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
};
