const store = require('../../../utils/store')
const util = require('../../../utils/util')

const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接单' },
  { key: 'cooking', label: '制作中' },
  { key: 'done', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

Page({
  data: {
    filters: FILTERS,
    filterKey: 'all',
    orders: [],
    totalCount: 0,
    pendingCount: 0,
    loading: true
  },

  onShow() {
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const user = await store.getCurrentUser()
      if (!user) {
        wx.reLaunch({ url: '/pages/login/login' })
        return
      }
      if (user.role !== 'chef') {
        wx.reLaunch({ url: '/pages/requester/index/index' })
        return
      }
      await this.refresh()
      this.setData({ loading: false })
    } catch (err) {
      this.setData({ loading: false })
      wx.showModal({
        title: '同步失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  },

  async refresh() {
    const raw = await store.getOrders()
    this.allOrders = raw.map(order => util.formatOrder(order, 'chef'))
    this.applyFilter()
  },

  applyFilter() {
    const all = this.allOrders || []
    const key = this.data.filterKey
    this.setData({
      orders: key === 'all' ? all : all.filter(order => order.status === key),
      totalCount: all.length,
      pendingCount: all.filter(order => order.status === 'pending').length
    })
  },

  onFilter(e) {
    this.setData({ filterKey: e.currentTarget.dataset.key })
    this.applyFilter()
  },

  onAction(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action

    if (action === 'accept') {
      this.runAction(id, 'cooking', '已接单')
      return
    }

    if (action === 'done') {
      this.runAction(id, 'done', '这单完成了')
      return
    }

    if (action === 'cancel') {
      wx.showModal({
        title: '取消这单',
        content: '取消后点菜人会看到「已取消」，确定吗？',
        confirmColor: '#F5583B',
        success: res => {
          if (!res.confirm) return
          this.runAction(id, 'cancelled', '已取消')
        }
      })
    }
  },

  async runAction(id, status, successText) {
    wx.showLoading({ title: '处理中', mask: true })
    try {
      await store.updateOrderStatus(id, status)
      wx.hideLoading()
      wx.showToast({ title: successText, icon: 'none' })
      await this.refresh()
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '操作失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  }
})
