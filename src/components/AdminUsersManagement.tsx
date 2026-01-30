import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, Shield, ShieldCheck, UserCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { PhoneInput } from '@/components/PhoneInput';

type AdminRole = 'site_admin' | 'tenant_admin';

interface AdminUser {
  id: string;
  user_id: string;
  role: AdminRole;
  phone_number: string | null;
  display_name: string | null;
  created_at: string;
  accessible_tenants: string[];
}

interface Tenant {
  id: string;
  name: string;
}

interface AdminUsersManagementProps {
  isSiteAdmin: boolean;
}

export const AdminUsersManagement = ({ isSiteAdmin }: AdminUsersManagementProps) => {
  const { user } = useAuth();
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // New admin form state
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [newAdminRole, setNewAdminRole] = useState<AdminRole>('tenant_admin');
  const [selectedTenants, setSelectedTenants] = useState<string[]>([]);
  
  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [adminToDelete, setAdminToDelete] = useState<AdminUser | null>(null);
  
  // Edit state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [adminToEdit, setAdminToEdit] = useState<AdminUser | null>(null);
  const [editTenants, setEditTenants] = useState<string[]>([]);

  useEffect(() => {
    fetchAdminUsers();
    fetchTenants();
  }, []);

  const fetchAdminUsers = async () => {
    try {
      // Use secure RPC to fetch admin users (bypasses RLS on user_roles)
      const { data: adminData, error: adminError } = await supabase.rpc('get_admin_users');

      if (adminError) throw adminError;

      if (!adminData || adminData.length === 0) {
        setAdminUsers([]);
        setLoading(false);
        return;
      }

      // Fetch tenant access for tenant admins
      const userIds = adminData.map((a: { user_id: string }) => a.user_id);
      const { data: tenantAccess, error: accessError } = await supabase
        .from('admin_tenant_access')
        .select('admin_user_id, tenant_id')
        .in('admin_user_id', userIds);

      if (accessError) {
        console.error('Error fetching tenant access:', accessError);
      }

      // Create access map
      const accessMap: Record<string, string[]> = {};
      tenantAccess?.forEach(a => {
        if (!accessMap[a.admin_user_id]) {
          accessMap[a.admin_user_id] = [];
        }
        accessMap[a.admin_user_id].push(a.tenant_id);
      });

      // Combine data
      const admins: AdminUser[] = adminData.map((admin: {
        id: string;
        user_id: string;
        role: string;
        created_at: string;
        phone_number: string | null;
        display_name: string | null;
      }) => {
        // Normalize 'admin' to 'site_admin' for display
        const normalizedRole = admin.role === 'admin' ? 'site_admin' : admin.role as AdminRole;
        return {
          id: admin.id,
          user_id: admin.user_id,
          role: normalizedRole,
          phone_number: admin.phone_number || null,
          display_name: admin.display_name || null,
          created_at: admin.created_at,
          accessible_tenants: accessMap[admin.user_id] || [],
        };
      });

      setAdminUsers(admins);
    } catch (err) {
      console.error('Error fetching admin users:', err);
      toast.error('Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setTenants(data || []);
    } catch (err) {
      console.error('Error fetching tenants:', err);
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminPhone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    if (newAdminRole === 'tenant_admin' && selectedTenants.length === 0) {
      toast.error('Select at least one tenant for tenant admin');
      return;
    }

    setIsCreating(true);
    try {
      // First, check if there's already an auth user with this phone
      // We'll use an edge function for this since we can't query auth.users directly
      const { data: result, error: fnError } = await supabase.functions.invoke('send-otp', {
        body: { phone_number: newAdminPhone, check_only: true },
      });

      let userId: string;

      if (result?.user_id) {
        // User exists, use their ID
        userId = result.user_id;
      } else {
        // User doesn't exist - we need to create them via OTP flow
        // For now, show a message that they need to sign up first
        toast.error('User must sign up first. Send them an invite to create an account.');
        setIsCreating(false);
        return;
      }

      // Check if they already have an admin role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .in('role', ['site_admin', 'tenant_admin', 'admin'])
        .single();

      if (existingRole) {
        toast.error('This user is already an admin');
        setIsCreating(false);
        return;
      }

      // Add the role
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newAdminRole });

      if (roleError) throw roleError;

      // If tenant admin, add tenant access
      if (newAdminRole === 'tenant_admin' && selectedTenants.length > 0) {
        const accessRecords = selectedTenants.map(tenantId => ({
          admin_user_id: userId,
          tenant_id: tenantId,
        }));

        const { error: accessError } = await supabase
          .from('admin_tenant_access')
          .insert(accessRecords);

        if (accessError) throw accessError;
      }

      toast.success('Admin user created successfully');
      setDialogOpen(false);
      setNewAdminPhone('');
      setNewAdminRole('tenant_admin');
      setSelectedTenants([]);
      fetchAdminUsers();
    } catch (err) {
      console.error('Error creating admin:', err);
      toast.error('Failed to create admin user');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteAdmin = async () => {
    if (!adminToDelete) return;

    // Prevent deleting yourself
    if (adminToDelete.user_id === user?.id) {
      toast.error("You can't delete your own admin access");
      setDeleteDialogOpen(false);
      return;
    }

    try {
      // Delete the role
      const { error: roleError } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', adminToDelete.id);

      if (roleError) throw roleError;

      // Delete tenant access records
      await supabase
        .from('admin_tenant_access')
        .delete()
        .eq('admin_user_id', adminToDelete.user_id);

      toast.success('Admin access removed');
      setAdminUsers(adminUsers.filter(a => a.id !== adminToDelete.id));
      setDeleteDialogOpen(false);
      setAdminToDelete(null);
    } catch (err) {
      console.error('Error deleting admin:', err);
      toast.error('Failed to remove admin access');
    }
  };

  const handleEditTenantAccess = async () => {
    if (!adminToEdit) return;

    try {
      // Delete all existing access
      await supabase
        .from('admin_tenant_access')
        .delete()
        .eq('admin_user_id', adminToEdit.user_id);

      // Insert new access records
      if (editTenants.length > 0) {
        const accessRecords = editTenants.map(tenantId => ({
          admin_user_id: adminToEdit.user_id,
          tenant_id: tenantId,
        }));

        const { error: accessError } = await supabase
          .from('admin_tenant_access')
          .insert(accessRecords);

        if (accessError) throw accessError;
      }

      toast.success('Tenant access updated');
      setEditDialogOpen(false);
      setAdminToEdit(null);
      fetchAdminUsers();
    } catch (err) {
      console.error('Error updating tenant access:', err);
      toast.error('Failed to update tenant access');
    }
  };

  const getTenantNames = (tenantIds: string[]) => {
    return tenantIds
      .map(id => tenants.find(t => t.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'None';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="w-5 h-5" />
                Admin Users
              </CardTitle>
              <CardDescription>
                Manage administrators who can access this portal
              </CardDescription>
            </div>
            {isSiteAdmin && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Admin User</DialogTitle>
                    <DialogDescription>
                      Grant admin access to an existing user by their phone number.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <PhoneInput
                        value={newAdminPhone}
                        onChange={setNewAdminPhone}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Select
                        value={newAdminRole}
                        onValueChange={(value: AdminRole) => setNewAdminRole(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="site_admin">
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="w-4 h-4" />
                              Site Admin
                            </div>
                          </SelectItem>
                          <SelectItem value="tenant_admin">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Tenant Admin
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {newAdminRole === 'site_admin'
                          ? 'Can access all tenants and manage admin users'
                          : 'Can only access selected tenants'}
                      </p>
                    </div>

                    {newAdminRole === 'tenant_admin' && (
                      <div className="space-y-2">
                        <Label>Tenant Access</Label>
                        <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2">
                          {tenants.map(tenant => (
                            <div key={tenant.id} className="flex items-center gap-2">
                              <Checkbox
                                id={`tenant-${tenant.id}`}
                                checked={selectedTenants.includes(tenant.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedTenants([...selectedTenants, tenant.id]);
                                  } else {
                                    setSelectedTenants(selectedTenants.filter(id => id !== tenant.id));
                                  }
                                }}
                              />
                              <label
                                htmlFor={`tenant-${tenant.id}`}
                                className="text-sm cursor-pointer"
                              >
                                {tenant.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateAdmin} disabled={isCreating}>
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Admin'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {adminUsers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No admin users found.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {adminUsers.map((adminUser) => (
                <div key={adminUser.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                      {adminUser.role === 'site_admin' ? (
                        <ShieldCheck className="w-5 h-5 text-primary" />
                      ) : (
                        <Shield className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">
                          {adminUser.display_name || adminUser.phone_number || 'Unknown User'}
                        </p>
                        <Badge variant={adminUser.role === 'site_admin' ? 'default' : 'secondary'}>
                          {adminUser.role === 'site_admin' ? 'Site Admin' : 'Tenant Admin'}
                        </Badge>
                        {adminUser.user_id === user?.id && (
                          <Badge variant="outline">You</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {adminUser.phone_number || 'No phone'}
                        {adminUser.role === 'tenant_admin' && (
                          <> • {adminUser.accessible_tenants.length} tenant{adminUser.accessible_tenants.length !== 1 ? 's' : ''}</>
                        )}
                      </p>
                    </div>
                  </div>
                  
                  {isSiteAdmin && adminUser.user_id !== user?.id && (
                    <div className="flex items-center gap-2">
                      {adminUser.role === 'tenant_admin' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAdminToEdit(adminUser);
                            setEditTenants(adminUser.accessible_tenants);
                            setEditDialogOpen(true);
                          }}
                        >
                          Edit Access
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setAdminToDelete(adminUser);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Tenant Access Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant Access</DialogTitle>
            <DialogDescription>
              Select which tenants this admin can access.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="border rounded-md p-3 max-h-64 overflow-y-auto space-y-2">
              {tenants.map(tenant => (
                <div key={tenant.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`edit-tenant-${tenant.id}`}
                    checked={editTenants.includes(tenant.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setEditTenants([...editTenants, tenant.id]);
                      } else {
                        setEditTenants(editTenants.filter(id => id !== tenant.id));
                      }
                    }}
                  />
                  <label
                    htmlFor={`edit-tenant-${tenant.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {tenant.name}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditTenantAccess}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Admin Access?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove admin access for{' '}
              <strong>{adminToDelete?.display_name || adminToDelete?.phone_number}</strong>.
              They will no longer be able to access the admin portal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteAdmin}>
              Remove Access
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
