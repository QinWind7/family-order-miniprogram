const store = require('../../utils/store')

Page({
  data: {
    name: '',
    avatarUrl: '',
    loading: false
  },

  onLoad() {
    this.loadSession()
  },

  async loadSession() {
    try {
      const user = await store.getCurrentUser()
      if (!user) return
      this.setData({
        name: user.name || '',
        avatarUrl: user.avatar || ''
      })
    } catch (err) {
      console.warn('[login] 读取云端身份失败', store.describeError(err))
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  async onChooseRole(e) {
    if (this.data.loading) return
    const role = e.currentTarget.dataset.role
    const name = (this.data.name || '').trim()
    if (!name) {
      wx.showToast({ title: '先告诉我怎么称呼你', icon: 'none' })
      return
    }

    this.setData({ loading: true })
    wx.showLoading({ title: '同步中', mask: true })

    try {
      const user = await store.login(name, this.data.avatarUrl, role)
      getApp().globalData.user = user
      wx.hideLoading()
      wx.reLaunch({
        url: role === 'chef' ? '/pages/chef/index/index' : '/pages/requester/index/index'
      })
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '云开发未就绪',
        content: store.describeError(err),
        showCancel: false
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})
