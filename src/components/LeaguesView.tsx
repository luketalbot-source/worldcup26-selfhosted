import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Users, Copy, Check, LogIn, Crown, Edit2, Trash2, LogOut, X, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useLeagues, League } from '@/hooks/useLeagues';
import { useLeagueLeaderboard } from '@/hooks/useLeagueLeaderboard';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { EmojiPicker } from '@/components/EmojiPicker';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const LEAGUE_QUICK_PICKS = ['🏆', '⚽', '🥇', '🌟', '🔥', '💪', '🦁', '🐯', '🦅', '👑', '⚡', '🎯', '🏅', '🎮', '🌍'];

// Special "Everyone" league constant
const EVERYONE_LEAGUE_ID = 'everyone';
const EVERYONE_LEAGUE: League = {
  id: EVERYONE_LEAGUE_ID,
  name: 'Everyone',
  avatar_emoji: '🌍',
  join_code: '',
  creator_id: '',
  created_at: '',
  member_count: 0,
};

const getRankDisplay = (rank: number) => {
  switch (rank) {
    case 1:
      return <span className="text-xl">🥇</span>;
    case 2:
      return <span className="text-xl">🥈</span>;
    case 3:
      return <span className="text-xl">🥉</span>;
    default:
      return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground bg-muted rounded-full">{rank}</span>;
  }
};

// Expandable League Card Component
const ExpandableLeagueCard = ({ 
  league, 
  isExpanded, 
  onToggle,
  isEveryone = false,
}: { 
  league: League; 
  isExpanded: boolean; 
  onToggle: () => void;
  isEveryone?: boolean;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId, tenant } = useTenant();
  const { leaveLeague, removeMember, deleteLeague, updateLeague, refetch } = useLeagues(tenantId);
  
  const { leaderboard: leagueLeaderboard, loading: leaderboardLoading, refetch: refetchLeaderboard } = useLeagueLeaderboard(
    isEveryone ? null : (isExpanded ? league.id : null),
    league.creator_id || null,
    tenantId
  );
  
  const { leaderboard: globalLeaderboard, loading: globalLeaderboardLoading } = useLeaderboard(
    isEveryone && isExpanded ? { tenantId, authMethod: tenant?.auth_method } : null
  );
  
  const activeLeaderboard = isEveryone ? globalLeaderboard : leagueLeaderboard;
  const activeLeaderboardLoading = isEveryone ? globalLeaderboardLoading : leaderboardLoading;
  
  const [copied, setCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showRemoveMemberDialog, setShowRemoveMemberDialog] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editName, setEditName] = useState(league.name);
  const [editEmoji, setEditEmoji] = useState(league.avatar_emoji || '🏆');
  const [saving, setSaving] = useState(false);
  
  const isCreator = user?.id === league.creator_id;
  
  const handleCopyCode = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const code = league.join_code;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t('leagues.codeCopied'));
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success(t('leagues.codeCopied'));
      } catch (fallbackErr) {
        console.error('Copy failed:', fallbackErr);
        toast.error(t('leagues.copyFailed'));
      }
      
      document.body.removeChild(textArea);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmLeaveLeague = async () => {
    if (!user) return;
    
    const success = await leaveLeague(league.id);
    if (success) {
      refetch();
    }
    setShowLeaveDialog(false);
  };

  const openRemoveMemberDialog = (memberId: string, memberName: string) => {
    setMemberToRemove({ id: memberId, name: memberName });
    setShowRemoveMemberDialog(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove) return;
    
    const success = await removeMember(league.id, memberToRemove.id);
    if (success) {
      refetchLeaderboard();
    }
    setShowRemoveMemberDialog(false);
    setMemberToRemove(null);
  };

  const handleConfirmDeleteLeague = async () => {
    const success = await deleteLeague(league.id);
    if (success) {
      refetch();
    }
    setShowDeleteDialog(false);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    
    setSaving(true);
    const success = await updateLeague(league.id, editName.trim(), editEmoji);
    setSaving(false);
    
    if (success) {
      setShowEditDialog(false);
      refetch();
    }
  };

  const openEditDialog = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditName(league.name);
    setEditEmoji(league.avatar_emoji || '🏆');
    setShowEditDialog(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
    >
      {/* Header - Always visible, clickable to toggle */}
      <div 
        onClick={onToggle}
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center text-2xl ${
            isEveryone 
              ? 'bg-gradient-to-br from-primary/20 to-accent/20' 
              : 'bg-muted'
          }`}>
            {isEveryone ? (
              <Globe className="w-7 h-7 text-primary" />
            ) : (
              league.avatar_emoji
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">
              {isEveryone ? t('leagues.everyone') : league.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isEveryone 
                ? t('leagues.everyoneSubtitle')
                : `${league.member_count || 0} ${(league.member_count || 0) === 1 ? t('leagues.member') : t('leagues.members')}`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEveryone && isCreator && (
              <Crown className="w-5 h-5 text-fifa-gold" />
            )}
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-4">
              {/* Join code - hide for Everyone league */}
              {!isEveryone && (
                <div className="flex items-center justify-between bg-muted rounded-xl p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('leagues.joinCode')}</p>
                    <p className="font-mono font-bold text-lg">{league.join_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCreator && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={openEditDialog}
                        className="h-9 w-9"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyCode}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              )}
              
              {/* League Leaderboard - Scrollable, max 10 visible */}
              {activeLeaderboardLoading ? (
                <div className="p-6 text-center text-muted-foreground">{t('leaderboard.loading')}</div>
              ) : activeLeaderboard.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-muted-foreground">{t('leaderboard.noPredictions')}</p>
                </div>
              ) : (
                <ScrollArea className="h-[220px] md:h-[440px] rounded-xl border border-border">
                  <div className="divide-y divide-border">
                    {activeLeaderboard.map((entry, index) => (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-3 p-3 ${
                          entry.userId === user?.id ? 'bg-primary/5' : ''
                        }`}
                      >
                        <div className="flex-shrink-0 w-8 flex justify-center">
                          {getRankDisplay(entry.rank)}
                        </div>
                        <div className="text-2xl">{entry.avatarEmoji}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate text-sm">
                            {entry.displayName}
                            {entry.userId === user?.id && (
                              <span className="ml-2 text-xs text-primary">{t('leaderboard.you')}</span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.totalPredictions} {entry.totalPredictions !== 1 ? t('leaderboard.predictions') : t('leaderboard.prediction')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {'isCreator' in entry && entry.isCreator && (
                            <Crown className="w-4 h-4 text-fifa-gold" />
                          )}
                          <div className="text-right">
                            <p className="text-base font-bold text-foreground">{entry.points}</p>
                            <p className="text-xs text-muted-foreground">{t('leaderboard.pts')}</p>
                          </div>
                          {/* Remove button - only for creator, not for self */}
                          {!isEveryone && isCreator && entry.userId !== user?.id && !('isCreator' in entry && entry.isCreator) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openRemoveMemberDialog(entry.userId, entry.displayName);
                              }}
                              className="ml-1 p-1.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                              title={t('leagues.removeMember')}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              
              {/* Scoring system explanation */}
              <div className="p-3 bg-muted/30 rounded-xl border border-border">
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <div className="font-bold text-foreground">3</div>
                    <div className="text-xs text-muted-foreground">{t('leaderboard.exactScore')}</div>
                  </div>
                  <div>
                    <div className="font-bold text-foreground">1</div>
                    <div className="text-xs text-muted-foreground">{t('leaderboard.correctWinner')}</div>
                  </div>
                  <div>
                    <div className="font-bold text-foreground">0</div>
                    <div className="text-xs text-muted-foreground">{t('leaderboard.wrong')}</div>
                  </div>
                </div>
              </div>
              
              {/* Leave / Delete League actions - hide for Everyone league */}
              {!isEveryone && (
                <div className="pt-2">
                  {isCreator ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {t('leagues.deleteLeague')}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowLeaveDialog(true);
                      }}
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('leagues.leaveLeague')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit League Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('leagues.editTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <EmojiPicker 
              value={editEmoji} 
              onChange={setEditEmoji} 
              quickPicks={LEAGUE_QUICK_PICKS}
            />
            
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
                onClick={() => setShowEditDialog(false)}
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
        </DialogContent>
      </Dialog>

      {/* Delete League Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leagues.confirmDelete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leagues.confirmDelete.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('leagues.confirmDelete.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteLeague}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('leagues.confirmDelete.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={showRemoveMemberDialog} onOpenChange={setShowRemoveMemberDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leagues.confirmRemove.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leagues.confirmRemove.description', { name: memberToRemove?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('leagues.confirmRemove.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRemoveMember}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('leagues.confirmRemove.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Leave League Confirmation Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('leagues.confirmLeave.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leagues.confirmLeave.description', { name: league.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('leagues.confirmLeave.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmLeaveLeague}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('leagues.confirmLeave.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export const LeaguesView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const { leagues, loading, createLeague, joinLeague, refetch } = useLeagues(tenantId);
  
  const [expandedLeagueId, setExpandedLeagueId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  
  // Create form state
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏆');
  const [createdLeague, setCreatedLeague] = useState<League | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Join form state
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    
    const league = await createLeague(newName.trim(), newEmoji);
    if (league) {
      setCreatedLeague(league);
    }
  };

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t('leagues.codeCopied'));
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = code;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setCopied(true);
        toast.success(t('leagues.codeCopied'));
      } catch (fallbackErr) {
        console.error('Copy failed:', fallbackErr);
        toast.error(t('leagues.copyFailed'));
      }
      
      document.body.removeChild(textArea);
    }
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    if (!joinCode.trim() || joinCode.length !== 6) return;
    
    setJoining(true);
    const success = await joinLeague(joinCode.trim());
    setJoining(false);
    
    if (success) {
      setJoinCode('');
      setShowJoinDialog(false);
      refetch();
    }
  };

  const resetCreate = () => {
    setNewName('');
    setNewEmoji('🏆');
    setCreatedLeague(null);
    setShowCreateDialog(false);
  };

  const toggleLeague = (leagueId: string) => {
    setExpandedLeagueId(prev => prev === leagueId ? null : leagueId);
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
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('leagues.create')}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setShowJoinDialog(true)}
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
      ) : (
        <div className="space-y-3">
          {/* Everyone League - Always at top */}
          <ExpandableLeagueCard
            league={EVERYONE_LEAGUE}
            isExpanded={expandedLeagueId === EVERYONE_LEAGUE_ID}
            onToggle={() => toggleLeague(EVERYONE_LEAGUE_ID)}
            isEveryone
          />
          
          {/* User's leagues */}
          {leagues.map((league) => (
            <ExpandableLeagueCard
              key={league.id}
              league={league}
              isExpanded={expandedLeagueId === league.id}
              onToggle={() => toggleLeague(league.id)}
            />
          ))}
        </div>
      )}

      {/* Create League Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) resetCreate();
        else setShowCreateDialog(true);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdLeague ? t('leagues.createdSuccess') : t('leagues.createTitle')}
            </DialogTitle>
          </DialogHeader>
          
          {createdLeague ? (
            <div className="py-4 space-y-4">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-3 text-4xl">
                  {createdLeague.avatar_emoji}
                </div>
                <h3 className="text-lg font-bold">{createdLeague.name}</h3>
              </div>
              
              <p className="text-sm text-muted-foreground text-center">
                {t('leagues.shareCode')}
              </p>
              
              <div className="flex items-center justify-center gap-3 bg-muted rounded-xl p-4">
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
          ) : (
            <div className="py-4 space-y-6">
              <EmojiPicker 
                value={newEmoji} 
                onChange={setNewEmoji} 
                quickPicks={LEAGUE_QUICK_PICKS}
              />
              
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
          )}
        </DialogContent>
      </Dialog>

      {/* Join League Dialog */}
      <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('leagues.joinTitle')}</DialogTitle>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            <div className="text-center">
              <Users className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {t('leagues.enterCode')}
              </p>
            </div>
            
            <Input
              value={joinCode}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
                setJoinCode(cleaned);
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData('text');
                const cleaned = pasted.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
                setJoinCode(cleaned);
              }}
              placeholder="XXXXXX"
              className="text-center font-mono text-2xl tracking-widest h-14"
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            
            <Button
              className="w-full"
              onClick={handleJoin}
              disabled={joinCode.length !== 6 || joining}
            >
              {joining ? t('leagues.joining') : t('leagues.joinButton')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
