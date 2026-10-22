const store = require('../../../utils/store')
const util = require('../../../utils/util')

Page({
  data: {
    items: [],
    totalQty: 0,
    remark: '',
    loading: true,
    submitting: false
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
      if (user.role !== 'requester') {
        wx.reLaunch({ url: '/pages/chef/index/index' })
        return
      }

      const dishes = await store.attachImageUrls(await store.getDishes())
      this.user = user
      this.dishMap = {}
      dishes.forEach(dish => {
        this.dishMap[dish.id] = util.decorateDish(dish)
      })

      this.applyCart()
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

  applyCart() {
    if (!this.user) return
    const cart = store.getCart(this.user.openid)
    const items = []
    cart.forEach(cartItem => {
      const dish = this.dishMap[cartItem.dishId]
      if (!dish) return
      items.push({
        dishId: dish.id,
        name: cartItem.name || dish.name,
        category: dish.category,
        imageUrl: dish.imageUrl,
        tone: dish.tone,
        initial: dish.initial,
        qty: cartItem.qty
      })
    })

    // 菜品被删除后，顺手清掉草稿中的残留项
    if (items.length !== cart.length) {
      store.saveCart(
        this.user.openid,
        items.map(item => ({ dishId: item.dishId, name: item.name, qty: item.qty }))
      )
    }

    this.setData({
      items,
      totalQty: items.reduce((sum, item) => sum + item.qty, 0)
    })
  },

  onPlus(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.filter(i => i.dishId === id)[0]
    if (!item || !this.user) return
    store.changeCartQty(this.user.openid, id, item.name, 1)
    this.applyCart()
  },

  onMinus(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.filter(i => i.dishId === id)[0]
    if (!item || !this.user) return
    store.changeCartQty(this.user.openid, id, item.name, -1)
    this.applyCart()
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value })
  },

  async onSubmit() {
    if (this.data.submitting) return
    if (!this.data.items.length) {
      wx.showToast({ title: '还没有选菜', icon: 'none' })
      return
    }

    const user = this.user || (await store.getCurrentUser())
    if (!user) {
      wx.reLaunch({ url: '/pages/login/login' })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '提交中', mask: true })

    try {
      await store.createOrder({
        requesterOpenid: user.openid,
        requesterName: user.name,
        items: this.data.items.map(item => ({
          name: item.name,
          qty: item.qty
        })),
        remark: (this.data.remark || '').trim()
      })
      store.clearCart(user.openid)
      wx.hideLoading()
      wx.showToast({ title: '已交给掌勺人', icon: 'success' })
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/orders/orders' })
      }, 700)
    } catch (err) {
      wx.hideLoading()
      this.setData({ submitting: false })
      wx.showModal({
        title: '提交失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  }
})
