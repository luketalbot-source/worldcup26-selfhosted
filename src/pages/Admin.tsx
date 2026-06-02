import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Copy, ExternalLink, Loader2, Shield, ArrowLeft, Users, Settings, Trophy, Star, Calendar, Pencil, Search, X, Download } from 'lucide-react';
import { getAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AdminLogin } from '@/components/AdminLogin';
import { TenantOIDCConfig } from '@/components/TenantOIDCConfig';
import { AdminBoostResults } from '@/components/AdminBoostResults';
import { AdminMatchesEditor } from '@/components/AdminMatchesEditor';
import { AdminPlayersEditor } from '@/components/AdminPlayersEditor';
import { TenantCustomBoosts } from '@/components/TenantCustomBoosts';
import { TenantTermsOfUseEditor } from '@/components/TenantTermsOfUseEditor';
import { LiveMatchesProvider } from '@/contexts/LiveMatchesContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface Tenant {
  id: string;
  uid: string;
  name: string;
  created_at: string;
  oidc_count: number;
  allow_custom_leagues?: boolean;
  terms_of_use?: string | null;
}

interface TenantUser {
  // The backend's /tenants/:id/users response returns u.id directly (the
  // user's primary key in public.users) — not a join-row id. So we use
  // `id` for both list keys AND the DELETE URL.
  id: string;
  display_name: string;
  avatar_emoji: string | null;
  created_at: string;
  // Engagement metrics. Postgres COUNT/SUM come back as strings or
  // BigInt depending on driver; the renderer coerces with Number().
  // Replace the old stubbed lastActive field which was never wired up.
  prediction_count: number | string;
  total_points: number | string;
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { i18n } = useTranslation();
  const navigate = useNavigate();

  // Admin always renders in the browser's language — not whatever's
  // cached in localStorage from a previous tenant-app session. Tenant
  // app intentionally caches the host-chosen language (so Flip can
  // drive it), but Admin lives outside that flow and a stale 'de' or
  // 'fr' cache would otherwise persist forever for an English-speaking
  // admin. This effect overrides the cache once on mount.
  useEffect(() => {
    const SUPPORTED = ['en', 'es', 'de', 'fr', 'pt', 'it'];
    const navLang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    const resolved = SUPPORTED.includes(navLang) ? navLang : 'en';
    if (i18n.language !== resolved) {
      void i18n.changeLanguage(resolved);
    }
    // i18n.changeLanguage is stable across renders; deps left empty so
    // this only runs once per mount of /admin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  // Edit-name flow: opens from the Pencil button on the detail header,
  // PATCHes /tenants/:id with the new name, mirrors into both the list
  // and the open detail panel so navigation back doesn't show the stale
  // name in either place.
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [savingName, setSavingName] = useState(false);
  // Tenant list search + filter. Both are pure client-side — the list is
  // small enough (currently single-digit count, will grow but not into
  // pagination territory before the WC) that re-filtering the loaded
  // array on every keystroke is fine and avoids a debounced query path.
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'with-users' | 'empty' | 'leagues-off'>('all');

  // Tenant detail view state
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userToDelete, setUserToDelete] = useState<TenantUser | null>(null);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState('');
  const [exportingResults, setExportingResults] = useState(false);

  // Set document title
  useEffect(() => {
    document.title = 'WC2026 Admin';
  }, []);

  // Check admin status
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const data = await api.get<{ is_admin: boolean }>('/rpc/is_any_admin');
        setIsAdmin(data.is_admin === true);
      } catch (err) {
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      checkAdmin();
    }
  }, [user, authLoading]);

  // Fetch tenants
  useEffect(() => {
    const fetchTenants = async () => {
      if (!isAdmin) return;

      try {
        const data = await api.get<Tenant[]>('/tenants');
        setTenants(data || []);
      } catch {
        // Error handled silently
      }
    };

    fetchTenants();
  }, [isAdmin]);

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return;

    setIsCreating(true);
    try {
      const data = await api.post<Tenant>('/tenants', { name: newTenantName.trim() });

      setTenants([{ ...data, oidc_count: 0 }, ...tenants]);
      setNewTenantName('');
      setDialogOpen(false);
      toast.success('Tenant created successfully');
    } catch {
      toast.error('Failed to create tenant');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    try {
      await api.delete(`/tenants/${tenantId}`);

      setTenants(tenants.filter(t => t.id !== tenantId));
      // If we were currently viewing this tenant's detail page, bounce
      // back to the list — otherwise the user lands on a detail panel
      // for a tenant that no longer exists.
      if (selectedTenant?.id === tenantId) {
        setSelectedTenant(null);
        setTenantUsers([]);
      }
      toast.success(`Tenant "${tenantName}" deleted`);
    } catch {
      toast.error('Failed to delete tenant');
    }
  };

  // Save the edited tenant name. Mirrors server state into both the list
  // and the open detail panel so navigating back doesn't show stale data.
  const handleSaveName = async () => {
    if (!selectedTenant) return;
    const next = editingName.trim();
    if (!next) {
      toast.error('Name cannot be empty');
      return;
    }
    if (next === selectedTenant.name) {
      setEditNameDialogOpen(false);
      return;
    }
    setSavingName(true);
    try {
      const updated = await api.patch<Tenant>(
        `/tenants/${selectedTenant.id}`,
        { name: next },
      );
      setTenants((ts) =>
        ts.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
      );
      setSelectedTenant({ ...selectedTenant, ...updated });
      toast.success('Tenant renamed');
      setEditNameDialogOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to rename tenant');
    } finally {
      setSavingName(false);
    }
  };

  const fetchTenantUsers = async (tenant: Tenant) => {
    setLoadingUsers(true);
    try {
      const users = await api.get<TenantUser[]>(`/tenants/${tenant.id}/users`);
      setTenantUsers(users || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleViewTenant = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    fetchTenantUsers(tenant);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete || deleteUserConfirmation !== userToDelete.display_name) return;

    try {
      await api.delete(`/admin/users/${userToDelete.id}`);

      setTenantUsers(tenantUsers.filter(u => u.id !== userToDelete.id));

      // Update tenant user count in the list
      setTenants(tenants.map(t =>
        t.id === selectedTenant?.id
          ? { ...t, oidc_count: Math.max((t.oidc_count ?? 1) - 1, 0) }
          : t
      ));

      toast.success(`User "${userToDelete.display_name}" deleted`);
      setDeleteUserDialogOpen(false);
      setUserToDelete(null);
      setDeleteUserConfirmation('');
    } catch {
      toast.error('Failed to delete user');
    }
  };

  // Results export — fetch the CSV via the admin endpoint and trigger
  // a browser download. We can't use a plain <a href="..." download>
  // because the endpoint is JWT-gated (Authorization header, not a
  // cookie) — browser navigation wouldn't carry the token. So we
  // fetch as a blob with the right auth, then synthesise a download
  // via an in-memory object URL.
  const handleExportResults = async () => {
    if (!selectedTenant) return;
    setExportingResults(true);
    try {
      const apiBase = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
      const token = getAccessToken();
      const res = await fetch(
        `${apiBase}/tenants/${selectedTenant.id}/results-export.csv`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          credentials: 'include',
        },
      );
      if (!res.ok) {
        // Backend returns JSON-shaped errors; surface its message if present.
        const body = await res.text();
        let msg = `Export failed (${res.status})`;
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          /* not JSON, keep default */
        }
        toast.error(msg);
        return;
      }
      const blob = await res.blob();
      // Mirror the server's filename convention (tenant uid +
      // date) so re-downloads don't collide and historical
      // exports survive in the user's Downloads folder with a
      // sortable name.
      const today = new Date().toISOString().slice(0, 10);
      const filename = `${selectedTenant.uid}-results-${today}.csv`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    } catch (err) {
      console.error('[results-export] failed', err);
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingResults(false);
    }
  };

  const copyTenantPath = async (uid: string) => {
    const path = `/t/${uid}`;
    try {
      await navigator.clipboard.writeText(path);
      toast.success('Path copied to clipboard');
    } catch {
      // Fallback for iframe contexts
      const textarea = document.createElement('textarea');
      textarea.value = path;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Path copied to clipboard');
    }
  };

  const openTenantApp = (uid: string) => {
    window.open(`${window.location.origin}/t/${uid}`, '_blank');
  };

  // Show loading
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in - show login form
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <AdminLogin />
      </div>
    );
  }

  // Not an admin
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="w-12 h-12 mx-auto text-destructive mb-4" />
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>You don't have permission to access the admin portal.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Dialogs that need to be available from BOTH the list view AND the
  // detail view. Earlier these only lived in the list-view return, so
  // clicking Rename / Delete on the detail header flipped state but
  // nothing rendered until the user navigated back — at which point
  // `selectedTenant` was null, and Save bailed out at the null-check.
  // Single function called from both returns: dialogs are mounted
  // wherever the user is when they trigger them.
  const renderTenantDialogs = () => (
    <>
      {/* Delete tenant — confirm by typing the name */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tenant?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                This will permanently delete <strong>"{tenantToDelete?.name}"</strong> and all associated data including users, predictions, and leagues.
              </p>
              <p className="font-medium text-destructive">This action cannot be undone.</p>
              <div className="pt-2">
                <label className="text-sm text-foreground">
                  Type <strong>{tenantToDelete?.name}</strong> to confirm:
                </label>
                <Input
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="Enter tenant name"
                  className="mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmation('')}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteConfirmation !== tenantToDelete?.name}
              onClick={() => {
                if (tenantToDelete && deleteConfirmation === tenantToDelete.name) {
                  handleDeleteTenant(tenantToDelete.id, tenantToDelete.name);
                  setDeleteDialogOpen(false);
                  setDeleteConfirmation('');
                  setTenantToDelete(null);
                }
              }}
            >
              Delete Permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename tenant. Save button stays disabled while name is empty
          or unchanged so the admin can't fire a no-op PATCH. Enter
          submits. */}
      <Dialog open={editNameDialogOpen} onOpenChange={setEditNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tenant</DialogTitle>
            <DialogDescription>
              The tenant URL ( /t/{selectedTenant?.uid} ) does not change —
              only the display name shown in the admin and to users.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="tenant-name-input">Name</Label>
            <Input
              id="tenant-name-input"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !savingName) {
                  e.preventDefault();
                  void handleSaveName();
                }
              }}
              placeholder={selectedTenant?.name ?? ''}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditNameDialogOpen(false)}
              disabled={savingName}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveName}
              disabled={
                savingName ||
                !editingName.trim() ||
                editingName.trim() === selectedTenant?.name
              }
            >
              {savingName ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  // Tenant detail view
  if (selectedTenant) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container py-8">
          <button
            onClick={() => {
              setSelectedTenant(null);
              setTenantUsers([]);
            }}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Tenants
          </button>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold text-foreground">{selectedTenant.name}</h1>
              <p className="text-muted-foreground font-mono">/t/{selectedTenant.uid}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyTenantPath(selectedTenant.uid)}
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Path
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openTenantApp(selectedTenant.uid)}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open App
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingName(selectedTenant.name);
                  setEditNameDialogOpen(true);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  setTenantToDelete(selectedTenant);
                  setDeleteConfirmation('');
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          <Tabs defaultValue="users" className="space-y-4">
            <TabsList>
              <TabsTrigger value="users" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Users
              </TabsTrigger>
              <TabsTrigger value="boosts" className="flex items-center gap-2">
                <Star className="w-4 h-4" />
                Custom Boosts
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="users">
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Users ({tenantUsers.length})
                      </CardTitle>
                      <CardDescription className="mt-1.5">Manage users in this tenant</CardDescription>
                    </div>
                    {/* Wide-format CSV dump: every user × every match
                        prediction (with points) × every boost pick. See
                        api/src/lib/resultsExport.ts for the shape. */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleExportResults}
                      disabled={exportingResults || tenantUsers.length === 0}
                      className="shrink-0"
                    >
                      {exportingResults ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Results export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingUsers ? (
                    <div className="py-8 text-center">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                    </div>
                  ) : tenantUsers.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground">
                      No users in this tenant yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {tenantUsers.map((tenantUser) => (
                        <div key={tenantUser.id} className="flex items-center justify-between py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{tenantUser.avatar_emoji || '👤'}</span>
                            <div>
                              <p className="font-medium text-foreground">{tenantUser.display_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Joined {new Date(tenantUser.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {/* Engagement at a glance — predictions placed and
                                running points total (same formula as the
                                leaderboard: 3 for exact, 1 for correct result,
                                plus any won boost / custom-boost points). */}
                            <div className="text-right text-xs text-muted-foreground">
                              <div>
                                <span className="font-semibold text-foreground tabular-nums">
                                  {Number(tenantUser.prediction_count ?? 0)}
                                </span>{' '}
                                prediction{Number(tenantUser.prediction_count ?? 0) === 1 ? '' : 's'}
                              </div>
                              <div>
                                <span className="font-semibold text-foreground tabular-nums">
                                  {Number(tenantUser.total_points ?? 0)}
                                </span>{' '}
                                point{Number(tenantUser.total_points ?? 0) === 1 ? '' : 's'}
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                setUserToDelete(tenantUser);
                                setDeleteUserConfirmation('');
                                setDeleteUserDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="boosts">
              <TenantCustomBoosts
                tenantId={selectedTenant.id}
                tenantName={selectedTenant.name}
              />
            </TabsContent>

            <TabsContent value="settings" className="space-y-6">
              {/* Feature flags. Stacked above the OIDC config so admins
                  see "what does this tenant get" before "how do they
                  log in". Per-flag PATCH so toggling one doesn't
                  re-write the others. */}
              <Card>
                <CardHeader>
                  <CardTitle>Features</CardTitle>
                  <CardDescription>
                    Per-tenant toggles. Default values are conservative —
                    every existing customer keeps current behaviour unless
                    explicitly opted out.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Sibling structure with htmlFor — NOT a wrapping <label>.
                      Wrapping fired the click twice on Radix Checkbox: once
                      from the checkbox itself, once from the label re-
                      targeting it, which silently undid every toggle the
                      admin made. htmlFor still gives the label its
                      standard role of "click-to-toggle" without the
                      double-fire. */}
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="allow-custom-leagues"
                      checked={selectedTenant.allow_custom_leagues !== false}
                      onCheckedChange={async (checked) => {
                        const next = checked === true;
                        try {
                          const updated = await api.patch<Tenant>(
                            `/tenants/${selectedTenant.id}`,
                            { allow_custom_leagues: next },
                          );
                          setTenants((ts) =>
                            ts.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
                          );
                          setSelectedTenant({ ...selectedTenant, ...updated });
                          toast.success(
                            next ? 'Custom leagues enabled' : 'Custom leagues disabled',
                          );
                        } catch (err) {
                          console.error(err);
                          toast.error('Failed to update setting');
                        }
                      }}
                      className="mt-0.5"
                    />
                    <Label htmlFor="allow-custom-leagues" className="space-y-1 cursor-pointer">
                      <div className="text-sm font-medium leading-none">
                        Allow custom leagues
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">
                        When enabled, users can create and join their own leagues
                        alongside the built-in <strong>Everyone</strong> league.
                        When disabled, only Everyone is shown — pre-expanded to
                        fill the viewport, no create/join buttons.
                      </p>
                    </Label>
                  </div>
                </CardContent>
              </Card>

              <TenantTermsOfUseEditor
                tenantId={selectedTenant.id}
                tenantName={selectedTenant.name}
                value={selectedTenant.terms_of_use ?? null}
                onSaved={(next) => {
                  // Keep both the list and the open detail panel in sync
                  // so navigating away and back doesn't show stale text.
                  setTenants((ts) =>
                    ts.map((t) =>
                      t.id === selectedTenant.id ? { ...t, terms_of_use: next } : t,
                    ),
                  );
                  setSelectedTenant({ ...selectedTenant, terms_of_use: next });
                }}
              />

              <TenantOIDCConfig
                tenantId={selectedTenant.id}
                tenantName={selectedTenant.name}
                tenantUid={selectedTenant.uid}
              />
            </TabsContent>
          </Tabs>

          {/* Delete User Confirmation Dialog */}
          <AlertDialog open={deleteUserDialogOpen} onOpenChange={setDeleteUserDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete User?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    This will permanently delete <strong>"{userToDelete?.display_name}"</strong> and all their predictions and league memberships.
                  </p>
                  <p className="font-medium text-destructive">This action cannot be undone.</p>
                  <div className="pt-2">
                    <label className="text-sm text-foreground">
                      Type <strong>{userToDelete?.display_name}</strong> to confirm:
                    </label>
                    <Input
                      value={deleteUserConfirmation}
                      onChange={(e) => setDeleteUserConfirmation(e.target.value)}
                      placeholder="Enter display name"
                      className="mt-2"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteUserConfirmation('')}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={deleteUserConfirmation !== userToDelete?.display_name}
                  onClick={handleDeleteUser}
                >
                  Delete User
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Shared dialogs — must be mounted in the same tree as the
              buttons that trigger them, otherwise state flips but the
              dialog doesn't render until the tree re-mounts (which
              clears selectedTenant first, breaking Save). */}
          {renderTenantDialogs()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Admin Portal</h1>
            <p className="text-muted-foreground">Manage tenants for the World Cup Predictor</p>
          </div>
        </div>

        <Tabs defaultValue="tenants" className="space-y-4">
          <TabsList>
            <TabsTrigger value="tenants">Tenants</TabsTrigger>
            <TabsTrigger value="matches" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Matches
            </TabsTrigger>
            <TabsTrigger value="players" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Players
            </TabsTrigger>
            <TabsTrigger value="boost" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Boost Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tenants" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Tenant
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Tenant</DialogTitle>
                    <DialogDescription>
                      Enter a name for the new tenant. A unique URL will be generated automatically.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Input
                      placeholder="Tenant name (e.g., Company Name)"
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateTenant()}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateTenant} disabled={isCreating || !newTenantName.trim()}>
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search + filter chips. Cheap to compute, so we just derive
                the filtered list inline rather than memo'ing — list size
                is tiny. */}
            {tenants.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or URL slug…"
                    className="pl-9 pr-9"
                    aria-label="Search tenants"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {([
                    { key: 'all',          label: 'All',                count: tenants.length },
                    { key: 'with-users',   label: 'With users',         count: tenants.filter((t) => Number(t.oidc_count ?? 0) > 0).length },
                    { key: 'empty',        label: 'Empty',              count: tenants.filter((t) => Number(t.oidc_count ?? 0) === 0).length },
                    { key: 'leagues-off',  label: 'Leagues disabled',   count: tenants.filter((t) => t.allow_custom_leagues === false).length },
                  ] as const).map((c) => (
                    <Button
                      key={c.key}
                      variant={filterMode === c.key ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterMode(c.key)}
                    >
                      {c.label}
                      <span className="ml-1.5 text-xs opacity-70">{c.count}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4">
          {(() => {
            const q = searchQuery.trim().toLowerCase();
            // Coerce oidc_count to a real number — postgres COUNT(*) can
            // come back as a string or BigInt depending on driver config,
            // and `"0" === 0` / `0n > 0` would silently break the filter.
            const userCount = (t: Tenant) => Number(t.oidc_count ?? 0);
            const filteredTenants = tenants.filter((t) => {
              if (filterMode === 'with-users'  && userCount(t) === 0) return false;
              if (filterMode === 'empty'       && userCount(t) > 0)   return false;
              if (filterMode === 'leagues-off' && t.allow_custom_leagues !== false) return false;
              if (!q) return true;
              return t.name.toLowerCase().includes(q) || t.uid.toLowerCase().includes(q);
            });
            // Default order is creation-date desc (from the API). For
            // "With users", sort by user count descending so the busiest
            // tenants float to the top — that's what an admin scanning
            // the list usually wants to see first.
            if (filterMode === 'with-users') {
              filteredTenants.sort((a, b) => userCount(b) - userCount(a));
            }
            if (tenants.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center">
                    <p className="text-muted-foreground">No tenants yet. Create your first tenant to get started.</p>
                  </CardContent>
                </Card>
              );
            }
            if (filteredTenants.length === 0) {
              return (
                <Card>
                  <CardContent className="py-12 text-center space-y-3">
                    <p className="text-muted-foreground">
                      No tenants match {searchQuery ? <strong>"{searchQuery}"</strong> : 'this filter'}.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearchQuery('');
                        setFilterMode('all');
                      }}
                    >
                      Clear filters
                    </Button>
                  </CardContent>
                </Card>
              );
            }
            return filteredTenants.map((tenant) => (
              <Card
                key={tenant.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => handleViewTenant(tenant)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{tenant.name}</h3>
                      <p className="text-sm text-muted-foreground font-mono">/t/{tenant.uid}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{tenant.oidc_count ?? 0} users</span>
                        <span>•</span>
                        <span>Created {new Date(tenant.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyTenantPath(tenant.uid)}
                        title="Copy URL"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openTenantApp(tenant.uid)}
                        title="Open App"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Delete Tenant"
                        onClick={() => {
                          setTenantToDelete(tenant);
                          setDeleteConfirmation('');
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ));
          })()}
            </div>
          </TabsContent>

          <TabsContent value="matches">
            <AdminMatchesEditor />
          </TabsContent>

          <TabsContent value="players">
            <AdminPlayersEditor />
          </TabsContent>

          <TabsContent value="boost">
            <AdminBoostResults />
          </TabsContent>
        </Tabs>

        {/* Shared with the detail view — same render function called there. */}
        {renderTenantDialogs()}
      </div>
    </div>
  );
};

// Wrap the admin shell in LiveMatchesProvider so anything inside (e.g.
// AdminBoostResults, TenantCustomBoosts) can use `useQualifiedTeams`,
// which derives "all teams in the tournament" from the live matches
// list rather than the stale static src/data/teams.ts file. The provider
// gracefully no-ops the admin-only `sync-matches` call when the user
// isn't logged in as admin (403 caught internally), so it's safe to
// mount above the AdminLogin gate.
const AdminWithProviders = () => (
  <LiveMatchesProvider>
    <Admin />
  </LiveMatchesProvider>
);

export default AdminWithProviders;
