import React from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

const PersonCard = React.memo(function PersonCard({ person }) {
  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        <Image 
          source={{ uri: person.image || 'https://via.placeholder.com/400x500?text=Profile+Image' }} 
          style={styles.image}
          resizeMode="cover"
        />
        <LinearGradient 
          colors={['transparent', 'rgba(0,0,0,0.7)']} 
          style={styles.gradient}
        />
        <View style={styles.infoOverlay}>
          <Text style={styles.name}>{person.name}, {person.age || 24}</Text>
          <Text style={styles.role}>{person.role}</Text>
        </View>
        <View style={styles.matchBadge}>
          <Text style={styles.matchText}>⚡ {person.match}% Match</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.sectionTitle}>ABOUT</Text>
        <Text style={styles.bio}>{person.aboutMe || person.bio || "No description provided."}</Text>
        <View style={styles.skillsRow}>
          {(person.skills || []).map((skill, i) => (
            <View key={i} style={styles.skillChip}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});

export default PersonCard;

const styles = StyleSheet.create({
  card: {
    width: width - 40,
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: 20,
  },
  imageContainer: {
    height: 350,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  infoOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  role: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
  },
  matchBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  matchText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF6B2C',
  },
  body: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ABABAB',
    letterSpacing: 1,
    marginBottom: 8,
  },
  bio: {
    fontSize: 15,
    color: '#6B6B6B',
    lineHeight: 22,
    marginBottom: 16,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    backgroundColor: 'rgba(255, 107, 44, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  skillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7B4FE9',
  },
});
