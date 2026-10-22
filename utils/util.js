const TONES = [
  'linear-gradient(135deg, #FFE7C2, #FFC98F)',
  'linear-gradient(135deg, #FFDFD6, #FFB49E)',
  'linear-gradient(135deg, #E8F2DA, #C6E0A8)',
  'linear-gradient(135deg, #DDEBF8, #B7D6F0)',
  'linear-gradient(135deg, #F5E3F6, #DCC0EA)',
  'linear-gradient(135deg, #F7EFD8, #E7D49E)'
]

const STATUS_TEXT = {
  pending: '待接单',
  cooking: '制作中',
  done: '已完成',
  cancelled: '已取消'
}

const STATUS_CLASS = {
  pending: 'st-pending',
  cooking: 'st-cooking',
  done: 'st-done',
  cancelled: 'st-cancelled'
}

function toneFor(key) {
  const text = String(key || '')
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973
  }
  return TONES[hash % TONES.length]
}

/** 给菜品补上占位色块和首字，未上传图片时也能有稳定视觉 */
function decorateDish(dish) {
  return Object.assign({}, dish, {
    initial: (dish.name || '?').charAt(0),
    tone: toneFor((dish.category || '') + (dish.name || ''))
  })
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const pad = num => (num < 10 ? '0' + num : String(num))
  const hm = pad(date.getHours()) + ':' + pad(date.getMinutes())
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return '今天 ' + hm
  return date.getMonth() + 1 + '月' + date.getDate() + '日 ' + hm
}

function buildActions(order, role) {
  if (role === 'chef') {
    if (order.status === 'pending') {
      return [
        { key: 'accept', label: '接单', type: 'primary' },
        { key: 'cancel', label: '做不了', type: 'ghost' }
      ]
    }
    if (order.status === 'cooking') {
      return [
        { key: 'done', label: '做好了', type: 'primary' },
        { key: 'cancel', label: '取消', type: 'ghost' }
      ]
    }
    return []
  }
  if (order.status === 'pending') {
    return [{ key: 'cancel', label: '取消点单', type: 'ghost' }]
  }
  return []
}

function formatOrder(order, role) {
  const items = order.items || []
  const totalQty = items.reduce((sum, item) => sum + (item.qty || 0), 0)
  return Object.assign({}, order, {
    items,
    totalQty,
    statusText: STATUS_TEXT[order.status] || order.status,
    statusClass: STATUS_CLASS[order.status] || 'st-pending',
    timeText: formatTime(order.createTime),
    actions: buildActions(order, role)
  })
}

function cartSummary(cart) {
  const list = cart || []
  return {
    count: list.reduce((sum, item) => sum + (item.qty || 0), 0),
    kinds: list.length
  }
}

module.exports = {
  decorateDish,
  greeting,
  formatTime,
  formatOrder,
  cartSummary
}
