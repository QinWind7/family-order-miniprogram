/**
 * 云开发数据层
 * users(openid, role, name)
 * dishes(name, category, image, available, note)
 * orders(requesterOpenid, requesterName, items, remark, status, createTime)
 *
 * 说明：users / dishes / orders 全部走云数据库；
 * 点菜清单只是提交前的临时草稿，仍保存在本机 storage。
 */
const FUNC_NAME = 'homeOrder'
const COLLECTIONS = {
  USERS: 'users',
  DISHES: 'dishes',
  ORDERS: 'orders'
}
const PAGE_SIZE = 20
const MAX_DISHES = 100
const MAX_ORDERS = 100
const CART_PREFIX = 'ho_cart_'

let session = null
let sessionPromise = null
let initPromise = null

function db() {
  if (!wx.cloud) throw new Error('当前基础库不支持云开发，请升级微信版本或开发者工具基础库')
  return wx.cloud.database()
}

function serverDate() {
  return db().serverDate()
}

function callFunction(action, payload) {
  const data = Object.assign({ action }, payload || {})
  return wx.cloud.callFunction({ name: FUNC_NAME, data }).then(res => {
    const result = (res && res.result) || {}
    if (result.ok === false) {
      throw new Error(result.message || '云函数返回失败')
    }
    return result
  })
}

/** 首次运行时由云函数创建 users / dishes / orders 集合（已存在则跳过） */
function initCollections() {
  if (!initPromise) {
    initPromise = callFunction('init')
      .then(result => {
        const collections = result.collections || {}
        const failed = Object.keys(collections).filter(
          name => collections[name] !== 'created' && collections[name] !== 'exists'
        )
        if (failed.length) {
          throw new Error(failed.map(name => name + '：' + collections[name]).join('；'))
        }
        return result
      })
      .catch(err => {
        initPromise = null
        throw err
      })
  }
  return initPromise
}

function normalizeUser(doc) {
  if (!doc) return null
  return {
    id: doc._id,
    openid: doc.openid,
    role: doc.role,
    name: doc.name,
    avatar: doc.avatar || ''
  }
}

function loadSession(force) {
  if (session && !force) return Promise.resolve(session)
  if (sessionPromise && !force) return sessionPromise

  sessionPromise = initCollections()
    .then(() => callFunction('login'))
    .then(result => db().collection(COLLECTIONS.USERS).where({ openid: result.openid }).limit(1).get()
      .then(res => {
        session = res.data.length ? normalizeUser(res.data[0]) : null
        return session
      }))
    .catch(err => {
      sessionPromise = null
      throw err
    })
  return sessionPromise
}

function getCurrentUser(force) {
  return loadSession(force)
}

async function uploadAvatar(openid, avatar) {
  if (!avatar) return ''
  if (avatar.indexOf('cloud://') === 0) return avatar
  try {
    const matched = avatar.match(/\.(\w+)$/)
    const ext = matched ? matched[1] : 'jpg'
    const res = await wx.cloud.uploadFile({
      cloudPath: 'avatars/' + openid + '-' + Date.now() + '.' + ext,
      filePath: avatar
    })
    return res.fileID
  } catch (err) {
    console.warn('[avatar] 上传失败，仅保存昵称', err)
    return ''
  }
}

async function login(name, avatar, role) {
  await initCollections()
  const result = await callFunction('login')
  const openid = result.openid
  const users = db().collection(COLLECTIONS.USERS)
  const existing = await users.where({ openid }).limit(1).get()
  const avatarFileID = await uploadAvatar(openid, avatar)
  const data = {
    openid,
    role,
    name,
    avatar: avatarFileID,
    updateTime: serverDate()
  }

  let user
  if (existing.data.length) {
    const doc = existing.data[0]
    await users.doc(doc._id).update({ data })
    user = Object.assign({}, doc, data)
  } else {
    data.createTime = serverDate()
    const added = await users.add({ data })
    user = Object.assign({ _id: added._id }, data)
  }

  session = normalizeUser(user)
  sessionPromise = Promise.resolve(session)
  return session
}

function logout() {
  session = null
  sessionPromise = null
}

function describeError(err) {
  const message = (err && (err.errMsg || err.message)) || '未知错误'
  if (/FUNCTION_NOT_FOUND|not found|找不到.*函数/i.test(message)) {
    return '云函数 homeOrder 尚未部署，请在开发者工具中右键 cloudfunctions/homeOrder 选择「上传并部署：云端安装依赖」'
  }
  if (/COLLECTION_NOT_EXIST|collection not exist|集合不存在/i.test(message)) {
    return '数据库集合尚未创建，请确认云函数已部署后重新进入，或到云开发控制台手动创建 users / dishes / orders'
  }
  if (/permission|PERMISSION_DENIED|无权限|权限/i.test(message)) {
    return '数据库权限不足，请到云开发控制台把 users / dishes / orders 的权限设为「所有用户可读，仅创建者可写」'
  }
  return message
}

/* ---------------- 菜品 ---------------- */

function normalizeDish(doc) {
  return {
    id: doc._id,
    name: doc.name,
    category: doc.category || '其他',
    image: doc.image || '',
    available: doc.available !== false,
    note: doc.note || ''
  }
}

async function getDishes() {
  const dishes = []
  const collection = db().collection(COLLECTIONS.DISHES)
  for (let skip = 0; skip < MAX_DISHES; skip += PAGE_SIZE) {
    const res = await collection.orderBy('createTime', 'asc').skip(skip).limit(PAGE_SIZE).get()
    res.data.forEach(doc => dishes.push(normalizeDish(doc)))
    if (res.data.length < PAGE_SIZE) break
  }
  return dishes
}

async function getDish(id) {
  try {
    const res = await db().collection(COLLECTIONS.DISHES).doc(id).get()
    if (!res || !res.data) return null
    return normalizeDish(res.data)
  } catch (err) {
    const message = (err && (err.errMsg || err.message)) || ''
    if (/DOCUMENT_NOT_FOUND|does not exist|not exist|不存在/i.test(message)) return null
    throw err
  }
}

function buildCategories(dishes) {
  const order = ['家常菜', '汤羹', '主食', '凉菜', '甜品', '其他']
  const seen = {}
  ;(dishes || []).forEach(dish => {
    if (dish.category) seen[dish.category] = true
  })
  return Object.keys(seen).sort((a, b) => {
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia === -1 && ib === -1) return a.localeCompare(b)
    if (ia === -1) return 1
    if (ib === -1) return -1
    return ia - ib
  })
}

function uniqueCloudFileIDs(values) {
  const ids = []
  ;(values || []).forEach(value => {
    if (typeof value === 'string' && value.indexOf('cloud://') === 0 && ids.indexOf(value) === -1) {
      ids.push(value)
    }
  })
  return ids
}

/** 通过云函数换取临时链接，绕过云存储“仅创建者可读”的限制 */
function getTempFileURLs(fileIDs) {
  const ids = uniqueCloudFileIDs(fileIDs)
  if (!ids.length) return Promise.resolve({})
  const chunks = []
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50))
  }
  return Promise.all(chunks.map(chunk => callFunction('getTempFileURL', { fileIDs: chunk })))
    .then(results => {
      const urls = {}
      results.forEach(result => Object.assign(urls, result.urls || {}))
      return urls
    })
}

/** 给菜品补充 imageUrl（可直接用于 image 组件） */
async function attachImageUrls(dishes) {
  const list = dishes || []
  let urls = {}
  try {
    urls = await getTempFileURLs(list.map(dish => dish.image))
  } catch (err) {
    console.warn('[image] 获取云存储临时链接失败', err)
  }
  return list.map(dish => {
    let imageUrl = ''
    if (dish.image) {
      imageUrl = dish.image.indexOf('cloud://') === 0 ? urls[dish.image] || '' : dish.image
    }
    return Object.assign({}, dish, { imageUrl })
  })
}

async function addDish(data) {
  const doc = {
    name: data.name,
    category: data.category || '其他',
    image: data.image || '',
    available: data.available !== false,
    note: data.note || '',
    createTime: serverDate(),
    updateTime: serverDate()
  }
  const res = await db().collection(COLLECTIONS.DISHES).add({ data: doc })
  return Object.assign({ id: res._id }, doc)
}

async function updateDish(id, patch) {
  await db().collection(COLLECTIONS.DISHES).doc(id).update({
    data: Object.assign({}, patch, { updateTime: serverDate() })
  })
  return getDish(id)
}

function setAvailable(id, available) {
  return updateDish(id, { available: !!available })
}

async function removeDish(id) {
  await db().collection(COLLECTIONS.DISHES).doc(id).remove()
}

/* ---------------- 点单 ---------------- */

function normalizeOrder(doc) {
  return Object.assign({}, doc, {
    id: doc._id,
    items: doc.items || [],
    remark: doc.remark || '',
    status: doc.status || 'pending'
  })
}

async function getOrders() {
  const orders = []
  const collection = db().collection(COLLECTIONS.ORDERS)
  for (let skip = 0; skip < MAX_ORDERS; skip += PAGE_SIZE) {
    const res = await collection.orderBy('createTime', 'desc').skip(skip).limit(PAGE_SIZE).get()
    res.data.forEach(doc => orders.push(normalizeOrder(doc)))
    if (res.data.length < PAGE_SIZE) break
  }
  return orders
}

async function getOrdersByRequester(openid) {
  const orders = await getOrders()
  return orders.filter(order => order.requesterOpenid === openid)
}

async function createOrder(payload) {
  const res = await db().collection(COLLECTIONS.ORDERS).add({
    data: {
      requesterOpenid: payload.requesterOpenid,
      requesterName: payload.requesterName,
      items: payload.items,
      remark: payload.remark || '',
      status: 'pending',
      createTime: serverDate(),
      updateTime: serverDate()
    }
  })
  return res._id
}

/** 点菜人取消自己的待接单：自己创建的记录可直接更新 */
async function cancelMyOrder(id) {
  const res = await db().collection(COLLECTIONS.ORDERS).doc(id).get()
  if (!res.data || res.data.status !== 'pending') {
    throw new Error('这单已经被掌勺人处理，无法取消')
  }
  await db().collection(COLLECTIONS.ORDERS).doc(id).update({
    data: {
      status: 'cancelled',
      updateTime: serverDate()
    }
  })
}

/** 掌勺人更新状态：订单由点菜人创建，需经云函数以管理员身份写入 */
function updateOrderStatus(id, status) {
  return callFunction('updateOrderStatus', { orderId: id, status })
}

/* ---------------- 点菜清单（本地临时草稿） ---------------- */

function readCart(key) {
  try {
    const value = wx.getStorageSync(key)
    return Array.isArray(value) ? value : []
  } catch (err) {
    return []
  }
}

function saveCart(openid, items) {
  try {
    wx.setStorageSync(CART_PREFIX + openid, items)
  } catch (err) {
    console.error('[cart] 保存失败', err)
  }
}

function getCart(openid) {
  return readCart(CART_PREFIX + openid)
}

function changeCartQty(openid, dishId, name, delta) {
  const cart = getCart(openid)
  let found = null
  for (let i = 0; i < cart.length; i++) {
    if (cart[i].dishId === dishId) {
      found = cart[i]
      break
    }
  }
  if (!found && delta > 0) {
    found = { dishId, name: name || '', qty: 0 }
    cart.push(found)
  }
  if (!found) return cart

  found.qty = Math.max(0, found.qty + delta)
  if (!found.name && name) found.name = name

  const next = cart
    .filter(item => item.qty > 0)
    .map(item => ({ dishId: item.dishId, name: item.name, qty: item.qty }))
  saveCart(openid, next)
  return next
}

function clearCart(openid) {
  saveCart(openid, [])
}

module.exports = {
  initCollections,
  getCurrentUser,
  login,
  logout,
  describeError,
  getDishes,
  getDish,
  buildCategories,
  getTempFileURLs,
  attachImageUrls,
  addDish,
  updateDish,
  setAvailable,
  removeDish,
  getOrders,
  getOrdersByRequester,
  createOrder,
  cancelMyOrder,
  updateOrderStatus,
  getCart,
  saveCart,
  changeCartQty,
  clearCart
}
