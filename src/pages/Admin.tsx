import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Copy, ExternalLink, Loader2, Shield, ArrowLeft, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminLogin } from '@/components/AdminLogin';
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
  profiles: { count: number }[];
}

interface TenantUser {
  id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string | null;
  phone_number: string | null;
  created_at: string;
}

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  
  // Tenant detail view state
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userToDelete, setUserToDelete] = useState<TenantUser | null>(null);
  const [deleteUserDialogOpen, setDeleteUserDialogOpen] = useState(false);
  const [deleteUserConfirmation, setDeleteUserConfirmation] = useState('');

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
        const { data, error } = await supabase
          .rpc('has_role', { _user_id: user.id, _role: 'admin' });
        
        if (error) throw error;
        setIsAdmin(data === true);
      } catch (err) {
        console.error('Error checking admin status:', err);
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
        const { data, error } = await supabase
          .from('tenants')
          .select('*, profiles(count)')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setTenants(data || []);
      } catch (err) {
        console.error('Error fetching tenants:', err);
      }
    };

    fetchTenants();
  }, [isAdmin]);

  const handleCreateTenant = async () => {
    if (!newTenantName.trim()) return;

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .insert({ name: newTenantName.trim() })
        .select()
        .single();

      if (error) throw error;

      setTenants([{ ...data, profiles: [{ count: 0 }] }, ...tenants]);
      setNewTenantName('');
      setDialogOpen(false);
      toast.success('Tenant created successfully');
    } catch (err) {
      console.error('Error creating tenant:', err);
      toast.error('Failed to create tenant');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteTenant = async (tenantId: string, tenantName: string) => {
    try {
      const { error } = await supabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (error) throw error;

      setTenants(tenants.filter(t => t.id !== tenantId));
      toast.success(`Tenant "${tenantName}" deleted`);
    } catch (err) {
      console.error('Error deleting tenant:', err);
      toast.error('Failed to delete tenant');
    }
  };

  const fetchTenantUsers = async (tenant: Tenant) => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenantUsers(data || []);
    } catch (err) {
      console.error('Error fetching tenant users:', err);
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
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', userToDelete.id);

      if (error) throw error;

      setTenantUsers(tenantUsers.filter(u => u.id !== userToDelete.id));
      
      // Update tenant user count in the list
      setTenants(tenants.map(t => 
        t.id === selectedTenant?.id 
          ? { ...t, profiles: [{ count: (t.profiles?.[0]?.count ?? 1) - 1 }] }
          : t
      ));
      
      toast.success(`User "${userToDelete.display_name}" deleted`);
      setDeleteUserDialogOpen(false);
      setUserToDelete(null);
      setDeleteUserConfirmation('');
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Failed to delete user');
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
    const publishedUrl = 'https://worldcup26.lovable.app';
    window.open(`${publishedUrl}/t/${uid}`, '_blank');
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
            <div className="flex items-center gap-2">
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
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Users ({tenantUsers.length})
              </CardTitle>
              <CardDescription>Manage users in this tenant</CardDescription>
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
                          <p className="text-sm text-muted-foreground">
                            {tenantUser.phone_number || 'No phone number'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Joined {new Date(tenantUser.created_at).toLocaleDateString()}
                        </span>
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

        <div className="grid gap-4">
          {tenants.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No tenants yet. Create your first tenant to get started.</p>
              </CardContent>
            </Card>
          ) : (
            tenants.map((tenant) => (
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
                        <span>{tenant.profiles?.[0]?.count ?? 0} users</span>
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
            ))
          )}
        </div>

        {/* Delete Confirmation Dialog */}
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
      </div>
    </div>
  );
};

export default Admin;
