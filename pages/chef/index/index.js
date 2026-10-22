const store = require('../../../utils/store')
const util = require('../../../utils/util')

Page({
  data: {
    user: null,
    greeting: '',
    dishes: [],
    availableCount: 0,
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
      this.setData({
        user,
        greeting: util.greeting()
      })
      await this.refresh()
      this.setData({ loading: false })
    } catch (err) {
      this.setData({ loading: false })
      this.showError(err)
    }
  },

  async refresh() {
    const results = await Promise.all([
      store.getDishes().then(list => store.attachImageUrls(list)),
      store.getOrders()
    ])
    const dishes = results[0].map(dish => util.decorateDish(dish))
    const pendingCount = results[1].filter(order => order.status === 'pending').length
    this.setData({
      dishes,
      availableCount: dishes.filter(dish => dish.available).length,
      pendingCount
    })
  },

  async onToggleAvailable(e) {
    const id = e.currentTarget.dataset.id
    try {
      await store.setAvailable(id, e.detail.value)
      await this.refresh()
    } catch (err) {
      wx.showModal({
        title: '修改失败',
        content: store.describeError(err),
        showCancel: false
      })
      await this.refresh().catch(() => {})
    }
  },

  onEdit(e) {
    wx.navigateTo({
      url: '/pages/chef/dish-edit/dish-edit?id=' + e.currentTarget.dataset.id
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const dish = this.data.dishes.filter(item => item.id === id)[0]
    wx.showModal({
      title: '删除菜品',
      content: '确定删除「' + (dish ? dish.name : '这道菜') + '」吗？',
      confirmColor: '#F5583B',
      success: res => {
        if (!res.confirm) return
        this.deleteDish(id)
      }
    })
  },

  async deleteDish(id) {
    wx.showLoading({ title: '删除中', mask: true })
    try {
      await store.removeDish(id)
      wx.hideLoading()
      await this.refresh()
      wx.showToast({ title: '已删除', icon: 'none' })
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '删除失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/chef/dish-edit/dish-edit' })
  },

  goOrders() {
    wx.navigateTo({ url: '/pages/chef/orders/orders' })
  },

  onSwitchRole() {
    wx.reLaunch({ url: '/pages/login/login' })
  },

  showError(err) {
    wx.showModal({
      title: '同步失败',
      content: store.describeError(err),
      showCancel: false
    })
  }
})
