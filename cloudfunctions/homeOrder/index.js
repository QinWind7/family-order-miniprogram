const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const COLLECTIONS = ['users', 'dishes', 'orders']

const STATUS_FLOW = {
  pending: ['cooking', 'cancelled'],
  cooking: ['done', 'cancelled']
}

async function ensureCollections() {
  const result = {}
  for (let i = 0; i < COLLECTIONS.length; i++) {
    const name = COLLECTIONS[i]
    try {
      await db.createCollection(name)
      result[name] = 'created'
    } catch (err) {
      const message = (err && (err.errMsg || err.message)) || String(err)
      result[name] = /exist|已存在/i.test(message) ? 'exists' : message
    }
  }
  return result
}

async function getCurrentUserDoc(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  return res.data[0] || null
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = event.action || 'login'

  try {
    if (action === 'init') {
      const collections = await ensureCollections()
      return { ok: true, collections }
    }

    if (action === 'login') {
      return { ok: true, openid: OPENID }
    }

    /**
     * 由云函数以管理员身份换取云存储临时链接。
     * 免费版无法调整云存储权限时，不同用户直接读 fileID 会被拒绝，
     * 但通过这里返回的临时 https 链接可以正常互相查看菜品图片。
     */
    if (action === 'getTempFileURL') {
      const fileIDs = (event.fileIDs || []).filter(
        id => typeof id === 'string' && id.indexOf('cloud://') === 0
      )
      if (!fileIDs.length) return { ok: true, urls: {} }

      const urls = {}
      const MAX_PER_CALL = 50
      for (let i = 0; i < fileIDs.length; i += MAX_PER_CALL) {
        const chunk = fileIDs.slice(i, i + MAX_PER_CALL)
        const res = await cloud.getTempFileURL({ fileList: chunk })
        ;(res.fileList || []).forEach(file => {
          if (file.status === 0 && file.tempFileURL) {
            urls[file.fileID] = file.tempFileURL
          }
        })
      }
      return { ok: true, urls }
    }

    if (action === 'updateOrderStatus') {
      const user = await getCurrentUserDoc(OPENID)
      if (!user || user.role !== 'chef') {
        return { ok: false, message: '只有掌勺人可以更新点单状态' }
      }

      const orderId = event.orderId
      const nextStatus = event.status
      if (!orderId || !nextStatus) {
        return { ok: false, message: '缺少订单参数' }
      }

      const orderRes = await db.collection('orders').doc(orderId).get()
      const order = orderRes.data
      const allowed = STATUS_FLOW[order.status] || []
      if (allowed.indexOf(nextStatus) === -1) {
        return { ok: false, message: '当前状态不允许该操作' }
      }

      // 云函数以管理员身份执行，可绕过“仅创建者可写”的集合权限
      await db.collection('orders').doc(orderId).update({
        data: {
          status: nextStatus,
          updateTime: db.serverDate()
        }
      })
      return { ok: true }
    }

    return { ok: false, message: '未知操作：' + action }
  } catch (err) {
    return {
      ok: false,
      message: (err && (err.errMsg || err.message)) || '云函数执行失败'
    }
  }
}
