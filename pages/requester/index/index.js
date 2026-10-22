const store = require('../../../utils/store')
const util = require('../../../utils/util')

Page({
  data: {
    user: null,
    greeting: '',
    categories: ['全部'],
    activeCategory: '全部',
    visibleDishes: [],
    cartCount: 0,
    cartKinds: 0,
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
      if (user.role !== 'requester') {
        wx.reLaunch({ url: '/pages/chef/index/index' })
        return
      }

      const dishes = await store.attachImageUrls(await store.getDishes())
      this.dishCache = dishes

      const categories = ['全部'].concat(store.buildCategories(dishes))
      let activeCategory = this.data.activeCategory
      if (categories.indexOf(activeCategory) === -1) activeCategory = '全部'

      this.setData({
        user,
        greeting: util.greeting(),
        categories,
        activeCategory
      })
      this.applyCart()
      this.setData({ loading: false })
    } catch (err) {
      this.setData({ loading: false })
      this.showError(err)
    }
  },

  /** 本地草稿清单变化后，只刷新数量，不重复读云数据库 */
  applyCart() {
    const user = this.data.user
    if (!user) return

    const cart = store.getCart(user.openid)
    const qtyMap = {}
    cart.forEach(item => {
      qtyMap[item.dishId] = item.qty
    })

    this.allDishes = (this.dishCache || []).map(dish => {
      const decorated = util.decorateDish(dish)
      decorated.qty = qtyMap[dish.id] || 0
      return decorated
    })

    const summary = util.cartSummary(cart)
    this.setData({
      visibleDishes: this.filterBy(this.data.activeCategory),
      cartCount: summary.count,
      cartKinds: summary.kinds
    })
  },

  filterBy(category) {
    if (category === '全部') return this.allDishes || []
    return (this.allDishes || []).filter(dish => dish.category === category)
  },

  onCategory(e) {
    const name = e.currentTarget.dataset.name
    this.setData({
      activeCategory: name,
      visibleDishes: this.filterBy(name)
    })
  },

  onPlus(e) {
    const id = e.currentTarget.dataset.id
    const dish = (this.dishCache || []).filter(item => item.id === id)[0]
    const user = this.data.user
    if (!dish || !user) return
    if (!dish.available) {
      wx.showToast({ title: '这道菜今天不做', icon: 'none' })
      return
    }
    store.changeCartQty(user.openid, dish.id, dish.name, 1)
    this.applyCart()
  },

  onMinus(e) {
    const id = e.currentTarget.dataset.id
    const dish = (this.dishCache || []).filter(item => item.id === id)[0]
    const user = this.data.user
    if (!dish || !user) return
    store.changeCartQty(user.openid, dish.id, dish.name, -1)
    this.applyCart()
  },

  goConfirm() {
    if (!this.data.cartCount) {
      wx.showToast({ title: '先选几道菜吧', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/requester/confirm/confirm' })
  },

  goMyOrders() {
    wx.navigateTo({ url: '/pages/orders/orders' })
  },

  showError(err) {
    wx.showModal({
      title: '同步失败',
      content: store.describeError(err),
      showCancel: false
    })
  }
})
