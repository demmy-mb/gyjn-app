import re

file_path = 'src/screens/ProfileScreen.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

avatar_search = """            {isPremium && (
              <View style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                backgroundColor: colors.brand.orange,
                width: 26,
                height: 26,
                borderRadius: 13,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#1E1815'
              }}>
                <Feather name="star" size={14} color="#FFF" />
              </View>
            )}"""

avatar_replace = """            {isPremium && (
              <LinearGradient
                colors={['#FFB042', '#FF6B2C']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 2,
                  borderColor: '#1E1815',
                  shadowColor: '#FF6B2C',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.5,
                  shadowRadius: 4,
                  elevation: 5
                }}>
                <Feather name="star" size={14} color="#FFF" />
              </LinearGradient>
            )}"""

pill_search = """            {isPremium && (
              <View style={{
                backgroundColor: 'rgba(255,107,44,0.2)',
                borderWidth: 1,
                borderColor: colors.brand.orange,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 12,
              }}>
                <Text style={{ color: colors.brand.orange, fontSize: 10, fontWeight: '800' }}>
                  PREMIUM
                </Text>
              </View>
            )}"""

pill_replace = """            {isPremium && (
              <LinearGradient
                colors={['rgba(255,107,44,0.15)', 'rgba(255,107,44,0.3)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{
                  borderWidth: 1,
                  borderColor: 'rgba(255,107,44,0.6)',
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4
                }}>
                <Feather name="award" size={10} color={colors.brand.orange} />
                <Text style={{ color: colors.brand.orange, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                  PREMIUM
                </Text>
              </LinearGradient>
            )}"""

content = content.replace(avatar_search, avatar_replace, 1)
content = content.replace(pill_search, pill_replace, 1)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated ProfileScreen.jsx")
