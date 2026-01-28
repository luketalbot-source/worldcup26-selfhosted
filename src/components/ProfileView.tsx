import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, Target, CheckCircle, XCircle, TrendingUp, LogOut, Edit2, LogIn, Zap, Globe, Moon, Sun, Monitor } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { usePredictions } from '@/hooks/usePredictions';
import { useUserStats } from '@/hooks/useUserStats';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
];

export const ProfileView = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const { profile, updateProfile } = useProfile(user?.id);
  const { predictions } = usePredictions();
  const { stats } = useUserStats(user?.id);
  const navigate = useNavigate();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  
  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleEdit = () => {
    setEditName(profile?.displayName || '');
    setEditAvatar(profile?.avatarEmoji || '👤');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      return;
    }
    
    const { error } = await updateProfile(editName, editAvatar) || {};
    if (!error) {
      setIsEditing(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
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
            <h2 className="text-xl font-bold text-white">{t('profile.guest')}</h2>
            <p className="text-white/70 text-sm mt-1">{t('profile.guestSubtitle')}</p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('profile.guestPrompt')}
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
              <div className="space-y-3">
                {/* Current selection display */}
                <div className="w-20 h-20 rounded-full bg-white/20 border-2 border-white/50 flex items-center justify-center mx-auto text-4xl">
                  {editAvatar}
                </div>
                
                {/* Quick pick emojis */}
                <div className="space-y-2">
                  <label className="text-xs text-white/70 block text-center">{t('profile.edit.tapToSelect')}</label>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['👤', '⚽', '🏆', '🎯', '🌟', '🔥', '💪', '🦁', '🐯', '🦅', '👑', '⚡', '🎮', '🏅', '🥇'].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setEditAvatar(emoji)}
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all ${
                          editAvatar === emoji 
                            ? 'bg-white/40 ring-2 ring-white scale-110' 
                            : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom emoji input */}
                <div className="text-center">
                  <label className="text-xs text-white/70 block mb-1">{t('profile.edit.orTypeEmoji')}</label>
                  <Input
                    type="text"
                    value={editAvatar}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === '') {
                        setEditAvatar('👤');
                      } else {
                        const chars = [...value];
                        setEditAvatar(chars[chars.length - 1]);
                      }
                    }}
                    className="w-16 h-12 mx-auto text-center text-2xl bg-white/20 border-white/30 rounded-lg"
                    maxLength={2}
                  />
                </div>
              </div>
              
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('profile.edit.displayName')}
                className="max-w-xs mx-auto text-center"
              />
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                  {t('profile.edit.cancel')}
                </Button>
                <Button size="sm" onClick={handleSave}>
                  {t('profile.edit.save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3 text-4xl">
                {profile?.avatarEmoji || '👤'}
              </div>
              <h2 className="text-xl font-bold text-white">{profile?.displayName || t('profile.predictor')}</h2>
            </>
          )}
        </div>
        
        <div className="p-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-xl p-4 text-center">
              <Target className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{predictions.length}</div>
              <div className="text-xs text-muted-foreground">{t('profile.predictions')}</div>
            </div>
            <div className="bg-muted rounded-xl p-4 text-center">
              <TrendingUp className="w-6 h-6 text-fifa-green mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.totalPoints}</div>
              <div className="text-xs text-muted-foreground">{t('profile.points')}</div>
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
        <h3 className="font-semibold text-foreground mb-4">{t('profile.yourStats')}</h3>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-fifa-gold" />
              <span className="text-sm text-foreground">{t('profile.exactScores')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.exactScores}</span>
          </div>
          
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-fifa-green" />
              <span className="text-sm text-foreground">{t('profile.correctResults')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.correctResults}</span>
          </div>
          
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm text-foreground">{t('profile.wrongResults')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.wrongResults}</span>
          </div>
          
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-primary" />
              <span className="text-sm text-foreground">{t('profile.accuracy')}</span>
            </div>
            <span className="font-semibold text-foreground">
              {stats.exactScores + stats.correctResults + stats.wrongResults > 0 
                ? `${stats.accuracy}%` 
                : '--'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Settings Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 p-4"
      >
        <h3 className="font-semibold text-foreground mb-4">{t('profile.settings')}</h3>
        
        <div className="space-y-4">
          {/* Language Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-foreground">{t('profile.language')}</span>
            </div>
            <div className="flex gap-1 flex-wrap justify-end">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => i18n.changeLanguage(lang.code)}
                  className={`px-2 py-1 rounded-lg text-lg transition-colors ${
                    i18n.language === lang.code 
                      ? 'bg-primary/20 ring-1 ring-primary' 
                      : 'hover:bg-muted'
                  }`}
                  title={lang.name}
                >
                  {lang.flag}
                </button>
              ))}
            </div>
          </div>
          
          {/* Theme Setting */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? (
                <Moon className="w-5 h-5 text-muted-foreground" />
              ) : theme === 'light' ? (
                <Sun className="w-5 h-5 text-muted-foreground" />
              ) : (
                <Monitor className="w-5 h-5 text-muted-foreground" />
              )}
              <span className="text-sm text-foreground">{t('profile.theme')}</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setTheme('light')}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'light' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                }`}
                title={t('theme.light')}
              >
                <Sun className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'dark' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                }`}
                title={t('theme.dark')}
              >
                <Moon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-2 rounded-lg transition-colors ${
                  theme === 'system' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                }`}
                title={t('theme.system')}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sign Out */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        onClick={handleSignOut}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-destructive/10 text-destructive font-semibold hover:bg-destructive/20 transition-colors"
      >
        <LogOut className="w-5 h-5" />
        {t('profile.signOut')}
      </motion.button>
    </div>
  );
};
