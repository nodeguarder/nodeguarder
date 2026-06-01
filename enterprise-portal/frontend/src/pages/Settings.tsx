import React, { useState, useEffect } from 'react'
import {
  Settings,
  Users,
  Key,
  Trash2,
  AlertTriangle,
  X,
  UserPlus,
  Eye,
  EyeOff,
  Save,
  Lock,
  Shield,
  Ban,
} from 'lucide-react'
import { getUsers, createUser, deleteUser, changePassword, resetUserPassword, updateUserRole, getOrganizationSettings, setDisconnectPassword, clearDisconnectPassword } from '@/api/client'
import { formatDate } from '@/lib/utils'
import { showToast } from '@/components/Toast'
import type { User } from '@/types'

function ProfileTab() {
  const [user, setUser] = useState<{ email: string; display_name: string; role: string } | null>(null)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    const u = localStorage.getItem('user')
    if (u) {
      try { setUser(JSON.parse(u)) } catch { /* */ }
    }
  }, [])

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return
    if (newPassword.length < 8) {
      showToast('New password must be at least 8 characters', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }
    setSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      showToast('Password updated successfully', 'success')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const roleColors: Record<string, string> = {
    ADMIN: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    SECURITYOPS: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    AUDITOR: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  }

  if (!user) return null

  return (
    <div className="max-w-lg">
      <div className="bg-portal-card border border-portal-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-portal-accent/10 flex items-center justify-center">
            <span className="text-xl font-bold text-portal-accent">{user.email.charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-portal-text">{user.display_name || user.email}</h3>
            <p className="text-sm text-portal-text-muted">{user.email}</p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border inline-block mt-1 ${roleColors[user.role] || roleColors.SECURITYOPS}`}>
              {user.role}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-portal-card border border-portal-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-6">
          <Lock className="w-4 h-4 text-portal-accent" />
          Change Password
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="input-field" placeholder="Enter current password" />
          </div>
          <div>
            <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">New Password</label>
            <div className="relative">
              <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field w-full pr-10" placeholder="At least 8 characters" />
              <button onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-portal-text-muted hover:text-portal-text">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Confirm New Password</label>
            <div className="relative">
              <input type={showConfirm ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input-field w-full pr-10" placeholder="Repeat new password" />
              <button onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-portal-text-muted hover:text-portal-text">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <button onClick={handleChangePassword} disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword} className="btn-primary flex items-center gap-2">
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Update Password
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', display_name: '', role: 'SECURITYOPS' })
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [resetPasswordFor, setResetPasswordFor] = useState<{ id: string; email: string } | null>(null)
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [resettingPassword, setResettingPassword] = useState(false)
  const [editingRole, setEditingRole] = useState<string | null>(null)
  const [savingRole, setSavingRole] = useState(false)

  const fetchUsers = () => {
    setLoading(true)
    getUsers()
      .then((res) => setUsers(res.users))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchUsers() }, [])

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) return
    setSaving(true)
    try {
      await createUser(createForm)
      setShowCreate(false)
      setCreateForm({ email: '', password: '', display_name: '', role: 'SECURITYOPS' })
      fetchUsers()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteUser(id)
      setDeleteConfirm(null)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message, 'error')
    }
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSavingRole(true)
    try {
      await updateUserRole(userId, newRole)
      setEditingRole(null)
      fetchUsers()
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSavingRole(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetPasswordFor || resetPasswordValue.length < 8) return
    setResettingPassword(true)
    try {
      await resetUserPassword(resetPasswordFor.id, resetPasswordValue)
      showToast('Password reset successfully', 'success')
      setResetPasswordFor(null)
      setResetPasswordValue('')
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setResettingPassword(false)
    }
  }

  const roleColors: Record<string, string> = {
    ADMIN: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    SECURITYOPS: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    AUDITOR: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-portal-text-muted">{users.length} {users.length === 1 ? 'user' : 'users'}</p>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-xs">
          <UserPlus className="w-4 h-4" />
          Create User
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-3 text-sm mb-6">{error}</div>
      )}

      <div className="bg-portal-card border border-portal-border rounded-xl overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Last Active</th>
              <th>Created</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i}>
                  {[...Array(6)].map((_, j) => (
                    <td key={j} className="px-4 py-4"><div className="h-4 bg-white/5 rounded animate-pulse" style={{ width: j === 1 ? '160px' : '80px' }} /></td>
                  ))}
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-portal-text-muted">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="font-medium text-portal-text">{user.display_name || '\u2014'}</td>
                  <td className="text-portal-text-muted">{user.email}</td>
                  <td>
                    {editingRole === user.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          defaultValue={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                          className="input-field text-xs py-1 px-2"
                          disabled={savingRole}
                          autoFocus
                          onBlur={() => setEditingRole(null)}
                        >
                          <option value="SECURITYOPS">Security Ops</option>
                          <option value="ADMIN">Admin</option>
                          <option value="AUDITOR">Auditor</option>
                        </select>
                        {savingRole && <div className="w-3 h-3 border-2 border-portal-accent/30 border-t-portal-accent rounded-full animate-spin" />}
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingRole(user.id)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${roleColors[user.role] || roleColors.SECURITYOPS}`}
                        title="Click to change role"
                      >
                        {user.role}
                      </button>
                    )}
                  </td>
                  <td className="text-sm text-portal-text-muted">{formatDate(user.last_active_at || null)}</td>
                  <td className="text-sm text-portal-text-muted">{formatDate(user.created_at || null)}</td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => { setResetPasswordFor({ id: user.id, email: user.email }); setResetPasswordValue('') }}
                        className="p-1.5 text-portal-text-muted hover:text-portal-accent hover:bg-portal-accent/10 rounded-lg transition-colors"
                        title="Reset password"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(user.id)}
                        className="p-1.5 text-portal-text-muted hover:text-portal-danger hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-portal-text">Create User</h3>
              <button onClick={() => setShowCreate(false)} className="text-portal-text-muted hover:text-portal-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Display Name</label>
                <input type="text" value={createForm.display_name} onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })} className="input-field" placeholder="John Doe" />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Email</label>
                <input type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className="input-field" placeholder="user@company.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Password</label>
                <input type="password" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })} className="input-field">
                  <option value="SECURITYOPS">Security Ops</option>
                  <option value="ADMIN">Admin</option>
                  <option value="AUDITOR">Auditor</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-portal-border">
              <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
              <button onClick={handleCreate} disabled={saving || !createForm.email || !createForm.password} className="btn-primary flex items-center gap-2">
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-portal-danger" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-portal-text">Delete User</h3>
                <p className="text-sm text-portal-text-muted">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="btn-danger">Delete User</button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordFor && (
        <div className="modal-overlay" onClick={() => setResetPasswordFor(null)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-portal-text">Reset Password</h3>
              <button onClick={() => setResetPasswordFor(null)} className="text-portal-text-muted hover:text-portal-text"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-portal-text-muted">Resetting password for <span className="font-semibold text-portal-text">{resetPasswordFor.email}</span></p>
              <div>
                <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">New Password</label>
                <input type="password" value={resetPasswordValue} onChange={(e) => setResetPasswordValue(e.target.value)} className="input-field" placeholder="At least 8 characters" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-portal-border">
              <button onClick={() => setResetPasswordFor(null)} className="btn-ghost">Cancel</button>
              <button onClick={handleResetPassword} disabled={resettingPassword || resetPasswordValue.length < 8} className="btn-primary flex items-center gap-2">
                {resettingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting...
                  </>
                ) : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function OrganizationTab() {
  const [passwordSet, setPasswordSet] = useState(false)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    getOrganizationSettings()
      .then((res) => setPasswordSet(res.disconnect_password_set))
      .catch(() => showToast('Failed to load org settings', 'error'))
      .finally(() => setLoading(false))
  }, [])

  const handleSetPassword = async () => {
    if (!password) return
    if (password.length < 4) {
      showToast('Password must be at least 4 characters', 'error')
      return
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error')
      return
    }
    setSaving(true)
    try {
      await setDisconnectPassword(password)
      showToast('Disconnect password set successfully', 'success')
      setPassword('')
      setConfirmPassword('')
      setPasswordSet(true)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleClearPassword = async () => {
    setSaving(true)
    try {
      await clearDisconnectPassword()
      showToast('Disconnect password removed', 'success')
      setPasswordSet(false)
      setConfirmClear(false)
    } catch (err: any) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-portal-accent/30 border-t-portal-accent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg">
      <div className="bg-portal-card border border-portal-border rounded-xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-portal-text flex items-center gap-2 mb-6">
          <Shield className="w-4 h-4 text-portal-accent" />
          Disconnect Password
        </h3>
        <p className="text-sm text-portal-text-muted mb-6 leading-relaxed">
          If set, agents will be required to enter this password before they can disconnect from enterprise management. This prevents local users from bypassing organizational security policies.
        </p>

        {passwordSet && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg px-4 py-3 text-sm mb-6 flex items-center gap-2">
            <Shield className="w-4 h-4 flex-shrink-0" />
            A disconnect password is currently set. Agents will prompt for this password when users attempt to disconnect.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">New Disconnect Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder={passwordSet ? 'Enter new password to change' : 'Enter disconnect password'}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-portal-text-muted mb-1.5 uppercase tracking-wider">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input-field"
              placeholder="Repeat password"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSetPassword}
              disabled={saving || !password || password !== confirmPassword}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {passwordSet ? 'Update Password' : 'Set Password'}
                </>
              )}
            </button>
            {passwordSet && (
              <button
                onClick={() => setConfirmClear(true)}
                className="btn-danger flex items-center gap-2"
              >
                <Ban className="w-4 h-4" />
                Remove Password
              </button>
            )}
          </div>
        </div>
      </div>

      {confirmClear && (
        <div className="modal-overlay" onClick={() => setConfirmClear(false)}>
          <div className="bg-portal-card border border-portal-border rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-portal-danger" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-portal-text">Remove Disconnect Password</h3>
                <p className="text-sm text-portal-text-muted">Agents will no longer require a password to disconnect.</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setConfirmClear(false)} className="btn-ghost">Cancel</button>
              <button onClick={handleClearPassword} disabled={saving} className="btn-danger flex items-center gap-2">
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Removing...
                  </>
                ) : 'Remove Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'users' | 'organization'>('profile')

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      <p className="page-desc">Manage users and system configuration</p>

      <div className="border-b border-portal-border mb-6">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`tab-btn flex items-center gap-2 ${activeTab === 'profile' ? 'active' : ''}`}
          >
            <Settings className="w-4 h-4" />
            Profile
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`tab-btn flex items-center gap-2 ${activeTab === 'users' ? 'active' : ''}`}
          >
            <Users className="w-4 h-4" />
            Users
          </button>
          <button
            onClick={() => setActiveTab('organization')}
            className={`tab-btn flex items-center gap-2 ${activeTab === 'organization' ? 'active' : ''}`}
          >
            <Shield className="w-4 h-4" />
            Organization
          </button>
        </div>
      </div>

      {activeTab === 'profile' ? <ProfileTab /> : activeTab === 'users' ? <UsersTab /> : <OrganizationTab />}
    </div>
  )
}
