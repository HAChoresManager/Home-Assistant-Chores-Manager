"""Simple state management for the Chores Dashboard."""

(function() {
    'use strict';
    
    class ChoresStore {
        constructor() {
            this.state = {
                // Data
                chores: [],
                assignees: [],
                stats: {},
                completedToday: 0,
                overdueCount: 0,
                themeSettings: {
                    backgroundColor: '#ffffff',
                    cardColor: '#f8f8f8',
                    primaryTextColor: '#000000',
                    secondaryTextColor: '#333333'
                },
                
                // UI State
                loading: false,
                error: null,
                selectedChore: null,
                showForm: false,
                showUserManagement: false,
                authError: false,
                authReady: false,
                
                // Optimistic updates tracking
                optimisticUpdates: {},
                skipNextRefresh: false,
                forceStableState: {},
                
                // Last update time
                lastUpdated: new Date()
            };
            
            this.listeners = [];
        }
        
        /**
         * Subscribe to state changes
         */
        subscribe(listener) {
            this.listeners.push(listener);
            
            // Return unsubscribe function
            return () => {
                const index = this.listeners.indexOf(listener);
                if (index > -1) {
                    this.listeners.splice(index, 1);
                }
            };
        }
        
        /**
         * Notify all listeners of state change
         */
        notify() {
            this.listeners.forEach(listener => listener(this.state));
        }
        
        /**
         * Update state
         */
        setState(updates) {
            this.state = {
                ...this.state,
                ...updates
            };
            this.notify();
        }
        
        /**
         * Get current state
         */
        getState() {
            return this.state;
        }
        
        /**
         * Update chores with optimistic updates applied
         */
        updateChores(chores) {
            const processed = chores.map(chore => {
                const choreId = chore.chore_id || chore.id;
                const optimisticData = this.state.optimisticUpdates[choreId];
                
                if (optimisticData && Date.now() < optimisticData.expiry) {
                    return {
                        ...chore,
                        ...optimisticData.data,
                        isOptimistic: true
                    };
                }
                
                return {
                    ...chore,
                    chore_id: choreId
                };
            });
            
            this.setState({ chores: processed });
        }
        
        /**
         * Add optimistic update
         */
        addOptimisticUpdate(choreId, data, expiryMs = 5000) {
            const optimisticUpdates = {
                ...this.state.optimisticUpdates,
                [choreId]: {
                    data: data,
                    expiry: Date.now() + expiryMs
                }
            };
            
            this.setState({ optimisticUpdates });
        }
        
        /**
         * Remove optimistic update
         */
        removeOptimisticUpdate(choreId) {
            const optimisticUpdates = { ...this.state.optimisticUpdates };
            delete optimisticUpdates[choreId];
            this.setState({ optimisticUpdates });
        }
        
        /**
         * Clean expired optimistic updates
         */
        cleanExpiredOptimisticUpdates() {
            const now = Date.now();
            const cleaned = Object.entries(this.state.optimisticUpdates)
                .filter(([_, data]) => data.expiry > now)
                .reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {});
            
            if (Object.keys(cleaned).length !== Object.keys(this.state.optimisticUpdates).length) {
                this.setState({ optimisticUpdates: cleaned });
            }
        }
        
        /**
         * Set force stable state for a chore
         */
        setForceStableState(choreId, state) {
            const forceStableState = {
                ...this.state.forceStableState,
                [choreId]: state
            };
            
            this.setState({ forceStableState });
        }
        
        /**
         * Clean expired force stable states
         */
        cleanExpiredForceStableStates() {
            const now = Date.now();
            const cleaned = Object.entries(this.state.forceStableState)
                .filter(([_, state]) => state.expires > now)
                .reduce((acc, [key, value]) => {
                    acc[key] = value;
                    return acc;
                }, {});
            
            if (Object.keys(cleaned).length !== Object.keys(this.state.forceStableState).length) {
                this.setState({ forceStableState: cleaned });
            }
        }
        
        /**
         * Reset all state
         */
        reset() {
            this.state = {
                chores: [],
                assignees: [],
                stats: {},
                completedToday: 0,
                overdueCount: 0,
                themeSettings: {
                    backgroundColor: '#ffffff',
                    cardColor: '#f8f8f8',
                    primaryTextColor: '#000000',
                    secondaryTextColor: '#333333'
                },
                loading: false,
                error: null,
                selectedChore: null,
                showForm: false,
                showUserManagement: false,
                authError: false,
                authReady: false,
                optimisticUpdates: {},
                skipNextRefresh: false,
                forceStableState: {},
                lastUpdated: new Date()
            };
            this.notify();
        }
    }
    
    // Create and export singleton instance
    window.ChoresStore = new ChoresStore();
})();