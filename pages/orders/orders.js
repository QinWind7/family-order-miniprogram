const store = require('../../utils/store')
const util = require('../../utils/util')

Page({
  data: {
    orders: [],
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
      const orders = await store.getOrdersByRequester(user.openid)
      this.setData({
        orders: orders.map(order => util.formatOrder(order, 'requester')),
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showModal({
        title: '同步失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  },

  onAction(e) {
    const id = e.currentTarget.dataset.id
    const action = e.currentTarget.dataset.action
    if (action !== 'cancel') return

    wx.showModal({
      title: '取消点单',
      content: '取消后掌勺人就不会看到这单了，确定吗？',
      confirmColor: '#F5583B',
      success: res => {
        if (!res.confirm) return
        this.cancelOrder(id)
      }
    })
  },

  async cancelOrder(id) {
    wx.showLoading({ title: '取消中', mask: true })
    try {
      await store.cancelMyOrder(id)
      wx.hideLoading()
      wx.showToast({ title: '已取消', icon: 'none' })
      await this.load()
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '取消失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  },

  goOrder() {
    wx.reLaunch({ url: '/pages/requester/index/index' })
  }
})
