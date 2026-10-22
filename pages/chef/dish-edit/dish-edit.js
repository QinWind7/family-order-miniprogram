const store = require('../../../utils/store')

const CATEGORY_OPTIONS = ['家常菜', '汤羹', '主食', '凉菜', '甜品', '其他']

Page({
  data: {
    isEdit: false,
    id: '',
    uploading: false,
    saving: false,
    previewImage: '',
    categoryOptions: CATEGORY_OPTIONS,
    form: {
      name: '',
      category: '家常菜',
      image: '',
      available: true,
      note: ''
    }
  },

  onLoad(options) {
    if (!options || !options.id) return
    this.loadDish(options.id)
  },

  async loadDish(id) {
    wx.showLoading({ title: '加载中' })
    try {
      const dish = await store.getDish(id)
      if (!dish) {
        wx.showToast({ title: '菜品不存在或已删除', icon: 'none' })
        return
      }
      wx.setNavigationBarTitle({ title: '编辑菜品' })
      let previewImage = ''
      if (dish.image) {
        if (dish.image.indexOf('cloud://') === 0) {
          try {
            const urls = await store.getTempFileURLs([dish.image])
            previewImage = urls[dish.image] || ''
          } catch (err) {
            console.warn('[image] 预览图获取失败', err)
          }
        } else {
          previewImage = dish.image
        }
      }
      this.setData({
        isEdit: true,
        id: dish.id,
        previewImage,
        form: {
          name: dish.name,
          category: dish.category,
          image: dish.image || '',
          available: !!dish.available,
          note: dish.note || ''
        }
      })
    } catch (err) {
      wx.showModal({
        title: '加载失败',
        content: store.describeError(err),
        showCancel: false
      })
    } finally {
      wx.hideLoading()
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onPickCategory(e) {
    this.setData({ 'form.category': e.currentTarget.dataset.name })
  },

  onAvailableChange(e) {
    this.setData({ 'form.available': e.detail.value })
  },

  onChooseImage() {
    if (this.data.uploading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        if (!res.tempFiles || !res.tempFiles.length) return
        this.uploadImage(res.tempFiles[0].tempFilePath)
      }
    })
  },

  async uploadImage(tempFilePath) {
    this.setData({ uploading: true })
    wx.showLoading({ title: '上传图片', mask: true })
    try {
      const matched = tempFilePath.match(/\.(\w+)$/)
      const ext = matched ? matched[1] : 'jpg'
      const cloudPath =
        'dishes/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext
      const res = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath
      })
      this.setData({ 'form.image': res.fileID })
      try {
        const urls = await store.getTempFileURLs([res.fileID])
        this.setData({ previewImage: urls[res.fileID] || '' })
      } catch (err) {
        console.warn('[image] 上传成功但预览链接获取失败', err)
        this.setData({ previewImage: '' })
      }
    } catch (err) {
      wx.showModal({
        title: '图片上传失败',
        content: (err && (err.errMsg || err.message)) || '请检查云存储权限后重试',
        showCancel: false
      })
    } finally {
      wx.hideLoading()
      this.setData({ uploading: false })
    }
  },

  onRemoveImage() {
    this.setData({ 'form.image': '', previewImage: '' })
  },

  async onSave() {
    if (this.data.saving) return
    if (this.data.uploading) {
      wx.showToast({ title: '图片还在上传，请稍候', icon: 'none' })
      return
    }
    const form = this.data.form
    const name = (form.name || '').trim()
    const category = (form.category || '').trim() || '其他'

    if (!name) {
      wx.showToast({ title: '给这道菜起个名字吧', icon: 'none' })
      return
    }

    const payload = {
      name,
      category,
      image: form.image || '',
      available: !!form.available,
      note: (form.note || '').trim()
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })

    try {
      if (this.data.isEdit) {
        await store.updateDish(this.data.id, payload)
      } else {
        await store.addDish(payload)
      }
      wx.hideLoading()
      wx.showToast({ title: this.data.isEdit ? '已保存' : '已添加', icon: 'success' })
      setTimeout(() => {
        wx.navigateBack()
      }, 600)
    } catch (err) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showModal({
        title: '保存失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  },

  onDelete() {
    wx.showModal({
      title: '删除菜品',
      content: '删除后点菜人就看不到这道菜了，确定吗？',
      confirmColor: '#F5583B',
      success: res => {
        if (!res.confirm) return
        this.deleteDish()
      }
    })
  },

  async deleteDish() {
    wx.showLoading({ title: '删除中', mask: true })
    try {
      await store.removeDish(this.data.id)
      wx.hideLoading()
      wx.navigateBack()
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '删除失败',
        content: store.describeError(err),
        showCancel: false
      })
    }
  }
})
